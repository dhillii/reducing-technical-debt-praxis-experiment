```jsx
import AppContext from '../app-context';
import Frame from './frame';
import React, {useContext, useEffect, useMemo, useRef, useState} from 'react';
import {ReactComponent as CircleAnimated} from '../icons/circle-anim.svg';
import {ReactComponent as ClearIcon} from '../icons/clear.svg';
import {ReactComponent as SearchIcon} from '../icons/search.svg';

const DEFAULT_MAX_POSTS = 10;
const STEP_MAX_POSTS = 10;
const INVALID_URL_REGEX = /\/404\/$/;

const modalStyles = {
    container: {
        zIndex: '3999999',
        position: 'fixed',
        left: '0',
        top: '0',
        width: '100%',
        height: '100%',
        overflow: 'hidden'
    },
    frame: {
        margin: 'auto',
        position: 'relative',
        padding: '0',
        outline: '0',
        width: '100%',
        opacity: '1',
        overflow: 'hidden',
        height: '100%'
    }
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useKeyUpListener(handler, node) {
    useEffect(() => {
        node?.ownerDocument.addEventListener('keyup', handler);
        return () => node?.ownerDocument.removeEventListener('keyup', handler);
    }, [handler, node]);
}

function useDispatchClose() {
    const {dispatch} = useContext(AppContext);
    return () => dispatch('update', {showPopup: false});
}

// ─── Highlight Utilities ──────────────────────────────────────────────────────

function buildHighlightRegex(highlight) {
    const pattern = highlight
        .split(' ')
        .map(word => {
            const escaped = String(word).replace(/\W/g, '\\&');
            return `^${escaped}|\\s${escaped}`;
        })
        .join('|');
    return new RegExp(pattern, 'ig');
}

function getMatchIndexes({text, highlight}) {
    if (!text || !highlight) {
        return [];
    }
    const regex = buildHighlightRegex(highlight);
    return [...text.matchAll(regex)].map(match => ({
        startIdx: match.index,
        endIdx: match.index + match[0].length
    }));
}

function getHighlightParts({text, highlight}) {
    const highlightIndexes = getMatchIndexes({text, highlight});
    const parts = [];
    let lastIdx = 0;

    highlightIndexes.forEach(({startIdx, endIdx}) => {
        if (lastIdx < startIdx) {
            parts.push({text: text.slice(lastIdx, startIdx), type: 'normal'});
        }
        parts.push({text: text.slice(startIdx, endIdx), type: 'highlight'});
        lastIdx = endIdx;
    });

    if (lastIdx < text?.length) {
        parts.push({text: text.slice(lastIdx), type: 'normal'});
    }

    return {parts, highlightIndexes};
}

function filterInvalidUrls(items) {
    return items.filter(item => !(item?.url && INVALID_URL_REGEX.test(item.url)));
}

function navigateTo(url) {
    if (url) {
        window.location.href = url;
    }
}

// ─── Small Shared Components ──────────────────────────────────────────────────

function SectionHeader({label}) {
    return (
        <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>
            {label}
        </h1>
    );
}

function ResultSection({children, className = 'border-t border-neutral-200 py-3 px-4 sm:px-7'}) {
    return <div className={className}>{children}</div>;
}

function HighlightWord({word, isExcerpt}) {
    const className = isExcerpt ? 'font-bold' : 'font-bold text-neutral-900';
    return <span className={className}>{word}</span>;
}

function HighlightedSection({text = '', highlight = '', isExcerpt}) {
    let {parts, highlightIndexes} = getHighlightParts({text, highlight});

    if (isExcerpt && highlightIndexes?.[0]?.startIdx > 50) {
        const trimmedText = '...' + text.slice(highlightIndexes[0].startIdx - 20);
        ({parts} = getHighlightParts({text: trimmedText, highlight}));
    }

    return (
        <>
            {parts.map((part, idx) =>
                part.type === 'highlight'
                    ? <HighlightWord key={idx} word={part.text} isExcerpt={isExcerpt} />
                    : <React.Fragment key={idx}>{part.text}</React.Fragment>
            )}
        </>
    );
}

// ─── Search Box ───────────────────────────────────────────────────────────────

function SearchClearIcon() {
    const {searchValue = '', dispatch} = useContext(AppContext);

    if (!searchValue) {
        return <SearchIcon className='text-neutral-900' alt='Search' />;
    }

    return (
        <button alt='Clear' className='-mb-[1px]' onClick={() => dispatch('update', {searchValue: ''})}>
            <ClearIcon className='text-neutral-900 hover:text-neutral-500 h-[1.1rem] w-[1.1rem]' />
        </button>
    );
}

function Loading() {
    const {indexComplete, searchValue} = useContext(AppContext);
    return (!indexComplete && searchValue) ? <CircleAnimated className='shrink-0' /> : null;
}

function CancelButton() {
    const {t} = useContext(AppContext);
    const closePopup = useDispatchClose();

    return (
        <button className='ms-3 text-sm text-neutral-500 sm:hidden' alt='Cancel' onClick={closePopup}>
            {t('Cancel')}
        </button>
    );
}

function SearchBox() {
    const {searchValue, dispatch, inputRef, t} = useContext(AppContext);
    const containerRef = useRef(null);
    const closePopup = useDispatchClose();

    useEffect(() => {
        const timer = setTimeout(() => inputRef?.current?.focus(), 150);
        return () => clearTimeout(timer);
    }, [inputRef]);

    useKeyUpListener(
        (e) => { if (e.key === 'Escape') closePopup(); },
        containerRef.current
    );

    const className = `z-10 relative flex items-center py-5 px-4 sm:px-7 bg-white ${
        searchValue ? 'rounded-t-lg shadow' : 'rounded-lg'
    }`;

    return (
        <div className={className} ref={containerRef}>
            <div className='flex items-center justify-center w-4 h-4 me-3'>
                <SearchClearIcon />
            </div>
            <input
                ref={inputRef}
                value={searchValue || ''}
                onChange={e => dispatch('update', {searchValue: e.target.value})}
                onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
                className='grow -my-5 py-5 -ms-3 ps-3 text-[1.65rem] focus-visible:outline-none placeholder:text-gray-400 outline-none truncate'
                placeholder={t('Search posts, tags and authors')}
            />
            <Loading />
            <CancelButton />
        </div>
    );
}

// ─── Result List Items ────────────────────────────────────────────────────────

function useResultItemClass(id, selectedResult, base) {
    return id === selectedResult ? `${base} bg-neutral-100` : base;
}

function TagListItem({tag, selectedResult, setSelectedResult}) {
    const {name, url, id} = tag;
    const className = useResultItemClass(
        id, selectedResult,
        'flex items-center py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer'
    );

    return (
        <div className={className} onClick={() => navigateTo(url)} onMouseEnter={() => setSelectedResult(id)}>
            <p className='me-2 text-sm font-bold text-neutral-400'>#</p>
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{name}</h2>
        </div>
    );
}

function PostListItem({post, selectedResult, setSelectedResult}) {
    const {searchValue} = useContext(AppContext);
    const {title, excerpt, url, id} = post;
    const className = useResultItemClass(
        id, selectedResult,
        'py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer'
    );

    return (
        <div className={className} onClick={() => navigateTo(url)} onMouseEnter={() => setSelectedResult(id)}>
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-800'>
                <HighlightedSection text={title} highlight={searchValue} isExcerpt={false} />
            </h2>
            <p className='text-neutral-400 leading-normal text-sm mt-0 mb-0 truncate'>
                <HighlightedSection text={excerpt} highlight={searchValue} isExcerpt={true} />
            </p>
        </div>
    );
}

function AuthorAvatar({name, avatar}) {
    if (avatar?.length) {
        return <img className='rounded-full bg-neutral-300 w-7 h-7 me-2 object-cover' src={avatar} alt={name} />;
    }
    return (
        <div className='rounded-full bg-neutral-200 w-7 h-7 me-2 flex items-center justify-center font-bold'>
            <span className='text-neutral-400'>{name.charAt(0)}</span>
        </div>
    );
}

function AuthorListItem({author, selectedResult, setSelectedResult}) {
    const {name, profile_image: profileImage, url, id} = author;
    const className = useResultItemClass(
        id, selectedResult,
        'py-[1rem] -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer flex items-center'
    );

    return (
        <div className={className} onClick={() => navigateTo(url)} onMouseEnter={() => setSelectedResult(id)}>
            <AuthorAvatar name={name} avatar={profileImage} />
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{name}</h2>
        </div>
    );
}

// ─── Result Sections ──────────────────────────────────────────────────────────

function TagResults({tags, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);
    if (!tags?.length) return null;

    return (
        <ResultSection>
            <SectionHeader label={t('Tags')} />
            {tags.map(tag => (
                <TagListItem key={tag.name} tag={tag} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
        </ResultSection>
    );
}

function AuthorResults({authors, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);
    if (!authors?.length) return null;

    return (
        <ResultSection>
            <SectionHeader label={t('Authors')} />
            {authors.map(author => (
                <AuthorListItem key={author.name} author={author} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
        </ResultSection>
    );
}

function ShowMoreButton({posts, maxPosts, setMaxPosts}) {
    const {t} = useContext(AppContext);
    if (!posts?.length || maxPosts >= posts.length) return null;

    return (
        <button
            className='w-full my-3 p-[1rem] border border-neutral-200 hover:border-neutral-300 text-neutral-800 hover:text-black font-semibold rounded transition duration-150 ease hover:ease'
            onClick={() => setMaxPosts(prev => prev + STEP_MAX_POSTS)}
        >
            {t('Show more results')}
        </button>
    );
}

function PostResults({posts, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);
    const [maxPosts, setMaxPosts] = useState(DEFAULT_MAX_POSTS);

    useEffect(() => { setMaxPosts(DEFAULT_MAX_POSTS); }, [posts]);

    if (!posts?.length) return null;

    const paginatedPosts = posts.slice(0, maxPosts + 1);

    return (
        <ResultSection>
            <SectionHeader label={t('Posts')} />
            {paginatedPosts.map(post => (
                <PostListItem key={post.title} post={post} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
            <ShowMoreButton setMaxPosts={setMaxPosts} maxPosts={maxPosts} posts={posts} />
        </ResultSection>
    );
}

function NoResultsBox() {
    const {t} = useContext(AppContext);
    return (
        <div className='py-4 px-7'>
            <p className='text-[1.65rem] text-neutral-400 leading-normal'>{t('No matches found')}</p>
        </div>
    );
}

// ─── Results with Keyboard Navigation ────────────────────────────────────────

function Results({posts, authors, tags}) {
    const {searchValue} = useContext(AppContext);
    const containerRef = useRef(null);

    const allResults = useMemo(() => [...authors, ...tags, ...posts], [authors, tags, posts]);
    const [selectedResult, setSelectedResult] = useState(allResults[0]?.id ?? null);

    useEffect(() => {
        setSelectedResult(allResults[0]?.id ?? null);
    }, [allResults]);

    useKeyUpListener((event) => {
        const idx = allResults.findIndex(r => r.id === selectedResult);

        if (event.key === 'ArrowUp' && allResults[idx - 1]) {
            setSelectedResult(allResults[idx - 1].id);
        } else if (event.key === 'ArrowDown' && allResults[idx + 1]) {
            setSelectedResult(allResults[idx + 1].id);
        } else if (event.key === 'Enter') {
            navigateTo(allResults[idx]?.url);
        }
    }, containerRef.current);

    if (!searchValue) return null;

    return (
        <div className='overflow-y-auto max-h-[calc(100vh-172px)] sm:max-h-[70vh] -mt-[1px]' ref={containerRef}>
            <AuthorResults authors={authors} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            <TagResults tags={tags} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            <PostResults posts={posts} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
        </div>
    );
}

// ─── Search Result Box ────────────────────────────────────────────────────────

function SearchResultBox() {
    const {searchValue = '', searchIndex, indexComplete} = useContext(AppContext);

    if (!indexComplete || !searchValue) return null;

    const searchResults = search