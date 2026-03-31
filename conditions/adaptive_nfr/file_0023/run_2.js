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

function useKeyUp(handler, node) {
    useEffect(() => {
        const target = node?.ownerDocument ?? node;
        target?.addEventListener('keyup', handler);
        return () => target?.removeEventListener('keyup', handler);
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
        .map(word => word.replace(/\W/g, '\\&'))
        .map((escaped, idx) => (idx === 0 ? `^${escaped}|\\s${escaped}` : `|^${escaped}|\\s${escaped}`))
        .join('');
    return new RegExp(pattern, 'ig');
}

function getMatchIndexes({text, highlight}) {
    if (!text || !highlight) {
        return [];
    }
    const matches = text.matchAll(buildHighlightRegex(highlight));
    return [...matches].map(match => ({
        startIdx: match.index,
        endIdx: (match.index ?? 0) + (match[0]?.length ?? 0)
    }));
}

function getHighlightParts({text, highlight}) {
    const highlightIndexes = getMatchIndexes({text, highlight});
    const parts = [];
    let lastIdx = 0;

    for (const {startIdx, endIdx} of highlightIndexes) {
        if (lastIdx < startIdx) {
            parts.push({text: text.slice(lastIdx, startIdx), type: 'normal'});
        }
        parts.push({text: text.slice(startIdx, endIdx), type: 'highlight'});
        lastIdx = endIdx;
    }

    if (lastIdx < text?.length) {
        parts.push({text: text.slice(lastIdx), type: 'normal'});
    }

    return {parts, highlightIndexes};
}

function resolveExcerptParts(text, highlight) {
    const {parts, highlightIndexes} = getHighlightParts({text, highlight});
    const firstMatch = highlightIndexes?.[0];
    if (firstMatch?.startIdx > 50) {
        const trimmed = '...' + text.slice(firstMatch.startIdx - 20);
        return getHighlightParts({text: trimmed, highlight}).parts;
    }
    return parts;
}

// ─── Small Presentational Components ─────────────────────────────────────────

function HighlightWord({word, isExcerpt}) {
    const className = isExcerpt ? 'font-bold' : 'font-bold text-neutral-900';
    return <span className={className}>{word}</span>;
}

function HighlightedSection({text = '', highlight = '', isExcerpt}) {
    const parts = isExcerpt
        ? resolveExcerptParts(text || '', highlight || '')
        : getHighlightParts({text: text || '', highlight: highlight || ''}).parts;

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

function SectionHeader({label}) {
    return (
        <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>
            {label}
        </h1>
    );
}

function NavigableItem({id, url, selectedResult, setSelectedResult, className, children}) {
    const isSelected = id === selectedResult;
    return (
        <div
            className={`${className}${isSelected ? ' bg-neutral-100' : ''}`}
            onClick={() => url && (window.location.href = url)}
            onMouseEnter={() => setSelectedResult(id)}
        >
            {children}
        </div>
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

    useEffect(() => {
        const timer = setTimeout(() => inputRef?.current?.focus(), 150);
        return () => clearTimeout(timer);
    }, [inputRef]);

    useKeyUp(
        (event) => {
            if (event.key === 'Escape') {
                dispatch('update', {showPopup: false});
            }
        },
        containerRef.current
    );

    const boxClass = `z-10 relative flex items-center py-5 px-4 sm:px-7 bg-white ${
        searchValue ? 'rounded-t-lg shadow' : 'rounded-lg'
    }`;

    return (
        <div className={boxClass} ref={containerRef}>
            <div className='flex items-center justify-center w-4 h-4 me-3'>
                <SearchClearIcon />
            </div>
            <input
                ref={inputRef}
                value={searchValue || ''}
                onChange={e => dispatch('update', {searchValue: e.target.value})}
                onKeyDown={e => ['ArrowUp', 'ArrowDown'].includes(e.key) && e.preventDefault()}
                className='grow -my-5 py-5 -ms-3 ps-3 text-[1.65rem] focus-visible:outline-none placeholder:text-gray-400 outline-none truncate'
                placeholder={t('Search posts, tags and authors')}
            />
            <Loading />
            <CancelButton />
        </div>
    );
}

// ─── Result Items ─────────────────────────────────────────────────────────────

function TagListItem({tag, selectedResult, setSelectedResult}) {
    return (
        <NavigableItem
            id={tag.id}
            url={tag.url}
            selectedResult={selectedResult}
            setSelectedResult={setSelectedResult}
            className='flex items-center py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer'
        >
            <p className='me-2 text-sm font-bold text-neutral-400'>#</p>
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{tag.name}</h2>
        </NavigableItem>
    );
}

function PostListItem({post, selectedResult, setSelectedResult}) {
    const {searchValue} = useContext(AppContext);
    return (
        <NavigableItem
            id={post.id}
            url={post.url}
            selectedResult={selectedResult}
            setSelectedResult={setSelectedResult}
            className='py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer'
        >
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-800'>
                <HighlightedSection text={post.title} highlight={searchValue} isExcerpt={false} />
            </h2>
            <p className='text-neutral-400 leading-normal text-sm mt-0 mb-0 truncate'>
                <HighlightedSection text={post.excerpt} highlight={searchValue} isExcerpt={true} />
            </p>
        </NavigableItem>
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
    return (
        <NavigableItem
            id={author.id}
            url={author.url}
            selectedResult={selectedResult}
            setSelectedResult={setSelectedResult}
            className='py-[1rem] -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer flex items-center'
        >
            <AuthorAvatar name={author.name} avatar={author.profile_image} />
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{author.name}</h2>
        </NavigableItem>
    );
}

// ─── Result Sections ──────────────────────────────────────────────────────────

function ResultSection({label, children}) {
    return (
        <div className='border-t border-neutral-200 py-3 px-4 sm:px-7'>
            <SectionHeader label={label} />
            {children}
        </div>
    );
}

function TagResults({tags, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);
    if (!tags?.length) {
        return null;
    }
    return (
        <ResultSection label={t('Tags')}>
            {tags.map(tag => (
                <TagListItem key={tag.name} tag={tag} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
        </ResultSection>
    );
}

function AuthorResults({authors, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);
    if (!authors?.length) {
        return null;
    }
    return (
        <ResultSection label={t('Authors')}>
            {authors.map(author => (
                <AuthorListItem key={author.name} author={author} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
        </ResultSection>
    );
}

function ShowMoreButton({posts, maxPosts, setMaxPosts}) {
    const {t} = useContext(AppContext);
    if (!posts?.length || maxPosts >= posts.length) {
        return null;
    }
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

    useEffect(() => setMaxPosts(DEFAULT_MAX_POSTS), [posts]);

    const paginatedPosts = useMemo(() => posts?.slice(0, maxPosts + 1), [posts, maxPosts]);

    if (!posts?.length) {
        return null;
    }

    return (
        <ResultSection label={t('Posts')}>
            {paginatedPosts.map(post => (
                <PostListItem key={post.title} post={post} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
            <ShowMoreButton setMaxPosts={setMaxPosts} maxPosts={maxPosts} posts={posts} />
        </ResultSection>
    );
}

// ─── Results Container ────────────────────────────────────────────────────────

function useKeyboardNavigation(allResults, selectedResult, setSelectedResult) {
    const containerRef = useRef(null);

    useKeyUp(
        (event) => {
            const idx = allResults.findIndex(r => r.id === selectedResult);
            if (event.key === 'ArrowUp' && allResults[idx - 1]) {
                setSelectedResult(allResults[idx - 1].id);
            } else if (event.key === 'ArrowDown' && allResults[idx + 1]) {
                setSelectedResult(allResults[idx + 1].id);
            } else if (event.key === 'Enter') {
                const result = allResults.find(r => r.id === selectedResult);
                if (result?.url) {
                    window.location.href = result.url;
                }
            }
        },
        containerRef.current
    );

    return containerRef;
}

function Results({posts, authors, tags}) {
    const {searchValue} = useContext(AppContext);

    const allResults = useMemo(() => [...authors, ...tags, ...posts], [authors, tags, posts]);
    const [selectedResult, setSelectedResult] = useState(allResults[0]?.id ?? null);

    useEffect(() => setSelectedResult(allResults[0]?.id ?? null), [allResults]);

    const containerRef = useKeyboardNavigation(allResults, selectedResult, setSelectedResult);

    if (!searchValue) {
        return null;
    }

    const resultProps = {selectedResult, setSelectedResult};

    return (
        <div className='overflow-y-auto max-h-[calc(100vh-172px)] sm:max-h-[70vh] -mt-[1px]' ref={containerRef}>
            <AuthorResults authors={authors} {...resultProps} />
            <TagResults tags={tags} {...resultProps} />
            <PostResults posts={posts} {...resultProps} />
        </div>
    );
}

function NoResultsBox