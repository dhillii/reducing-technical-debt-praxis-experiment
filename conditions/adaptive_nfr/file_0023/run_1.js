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

const modalContainerStyle = {
    zIndex: '3999999',
    position: 'fixed',
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    overflow: 'hidden'
};

const frameCommonStyle = {
    margin: 'auto',
    position: 'relative',
    padding: '0',
    outline: '0',
    width: '100%',
    opacity: '1',
    overflow: 'hidden',
    height: '100%'
};

// --- Hooks ---

function useKeyUp(handler, node) {
    useEffect(() => {
        const target = node?.ownerDocument ?? document;
        target.addEventListener('keyup', handler);
        return () => target.removeEventListener('keyup', handler);
    }, [handler, node]);
}

function useDispatchClose() {
    const {dispatch} = useContext(AppContext);
    return () => dispatch('update', {showPopup: false});
}

// --- Utility ---

function filterInvalidUrls(items) {
    return items.filter(item => !(item?.url && INVALID_URL_REGEX.test(item.url)));
}

function getMatchIndexes({text, highlight}) {
    if (!text || !highlight) {
        return [];
    }
    const regexParts = highlight.split(' ').map((word, idx) => {
        const escaped = String(word).replace(/\W/g, '\\&');
        return idx === 0 ? `^${escaped}|\\s${escaped}` : `|^${escaped}|\\s${escaped}`;
    });
    const matchRegex = new RegExp(regexParts.join(''), 'ig');
    return [...text.matchAll(matchRegex)].map(match => ({
        startIdx: match.index,
        endIdx: (match.index || 0) + (match[0]?.length || 0)
    }));
}

function getHighlightParts({text, highlight}) {
    const highlightIndexes = getMatchIndexes({text, highlight});
    const parts = [];
    let lastIdx = 0;

    highlightIndexes.forEach(({startIdx, endIdx}) => {
        if (lastIdx !== startIdx) {
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

function buildExcerptParts(text, highlight, highlightIndexes) {
    const startIdx = highlightIndexes[0]?.startIdx;
    if (startIdx > 50) {
        const trimmedText = '...' + text.slice(startIdx - 20);
        return getHighlightParts({text: trimmedText, highlight}).parts;
    }
    return null;
}

// --- Small UI Components ---

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
    if (!indexComplete && searchValue) {
        return <CircleAnimated className='shrink-0' />;
    }
    return null;
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

function HighlightWord({word, isExcerpt}) {
    const className = isExcerpt ? 'font-bold' : 'font-bold text-neutral-900';
    return <span className={className}>{word}</span>;
}

function HighlightedSection({text = '', highlight = '', isExcerpt}) {
    text = text || '';
    highlight = highlight || '';

    let {parts, highlightIndexes} = getHighlightParts({text, highlight});

    if (isExcerpt && highlightIndexes[0]) {
        const excerptParts = buildExcerptParts(text, highlight, highlightIndexes);
        if (excerptParts) {
            parts = excerptParts;
        }
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

function NoResultsBox() {
    const {t} = useContext(AppContext);
    return (
        <div className='py-4 px-7'>
            <p className='text-[1.65rem] text-neutral-400 leading-normal'>{t('No matches found')}</p>
        </div>
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

// --- List Items ---

function ResultListItem({className, onClick, onMouseEnter, children}) {
    return (
        <div className={className} onClick={onClick} onMouseEnter={onMouseEnter}>
            {children}
        </div>
    );
}

function useResultItemClass(baseClass, id, selectedResult) {
    return id === selectedResult ? `${baseClass} bg-neutral-100` : baseClass;
}

function TagListItem({tag, selectedResult, setSelectedResult}) {
    const {name, url, id} = tag;
    const className = useResultItemClass(
        'flex items-center py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer',
        id,
        selectedResult
    );
    return (
        <ResultListItem
            className={className}
            onClick={() => url && (window.location.href = url)}
            onMouseEnter={() => setSelectedResult(id)}
        >
            <p className='me-2 text-sm font-bold text-neutral-400'>#</p>
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{name}</h2>
        </ResultListItem>
    );
}

function PostListItem({post, selectedResult, setSelectedResult}) {
    const {searchValue} = useContext(AppContext);
    const {title, excerpt, url, id} = post;
    const className = useResultItemClass(
        'py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer',
        id,
        selectedResult
    );
    return (
        <ResultListItem
            className={className}
            onClick={() => url && (window.location.href = url)}
            onMouseEnter={() => setSelectedResult(id)}
        >
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-800'>
                <HighlightedSection text={title} highlight={searchValue} isExcerpt={false} />
            </h2>
            <p className='text-neutral-400 leading-normal text-sm mt-0 mb-0 truncate'>
                <HighlightedSection text={excerpt} highlight={searchValue} isExcerpt={true} />
            </p>
        </ResultListItem>
    );
}

function AuthorListItem({author, selectedResult, setSelectedResult}) {
    const {name, profile_image: profileImage, url, id} = author;
    const className = useResultItemClass(
        'py-[1rem] -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer flex items-center',
        id,
        selectedResult
    );
    return (
        <ResultListItem
            className={className}
            onClick={() => url && (window.location.href = url)}
            onMouseEnter={() => setSelectedResult(id)}
        >
            <AuthorAvatar name={name} avatar={profileImage} />
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{name}</h2>
        </ResultListItem>
    );
}

// --- Result Sections ---

function ResultSection({title, children}) {
    return (
        <div className='border-t border-gray-200 py-3 px-4 sm:px-7'>
            <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>{title}</h1>
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
        <ResultSection title={t('Tags')}>
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
        <ResultSection title={t('Authors')}>
            {authors.map(author => (
                <AuthorListItem key={author.name} author={author} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
        </ResultSection>
    );
}

function PostResults({posts, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);
    const [maxPosts, setMaxPosts] = useState(DEFAULT_MAX_POSTS);
    const paginatedPosts = useMemo(() => posts?.slice(0, maxPosts + 1), [posts, maxPosts]);

    useEffect(() => {
        setMaxPosts(DEFAULT_MAX_POSTS);
    }, [posts]);

    if (!posts?.length) {
        return null;
    }

    return (
        <ResultSection title={t('Posts')}>
            {paginatedPosts.map(post => (
                <PostListItem key={post.title} post={post} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
            <ShowMoreButton setMaxPosts={setMaxPosts} maxPosts={maxPosts} posts={posts} />
        </ResultSection>
    );
}

// --- Search Components ---

function SearchBox() {
    const {searchValue, dispatch, inputRef, t} = useContext(AppContext);
    const containerRef = useRef(null);
    const closePopup = useDispatchClose();

    useEffect(() => {
        const timer = setTimeout(() => inputRef?.current?.focus(), 150);
        return () => clearTimeout(timer);
    }, [inputRef]);

    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') {
                closePopup();
            }
        };
        const node = containerRef?.current;
        node?.ownerDocument.addEventListener('keyup', handler);
        return () => node?.ownerDocument.removeEventListener('keyup', handler);
    }, [closePopup]);

    const className = searchValue
        ? 'z-10 relative flex items-center py-5 px-4 sm:px-7 bg-white rounded-t-lg shadow'
        : 'z-10 relative flex items-center py-5 px-4 sm:px-7 bg-white rounded-lg';

    return (
        <div className={className} ref={containerRef}>
            <div className='flex items-center justify-center w-4 h-4 me-3'>
                <SearchClearIcon />
            </div>
            <input
                ref={inputRef}
                value={searchValue || ''}
                onChange={e => dispatch('update', {searchValue: e.target.value})}
                onKeyDown={e => (e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.preventDefault()}
                className='grow -my-5 py-5 -ms-3 ps-3 text-[1.65rem] focus-visible:outline-none placeholder:text-gray-400 outline-none truncate'
                placeholder={t('Search posts, tags and authors')}
            />
            <Loading />
            <CancelButton />
        </div>
    );
}

function useKeyboardNavigation(allResults, selectedResult, setSelectedResult) {
    const containerRef = useRef(null);

    useEffect(() => {
        const handler = (event) => {
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
        };

        const node = containerRef?.current;
        node?.ownerDocument.addEventListener('keyup', handler);
        return () => node?.ownerDocument.removeEventListener('keyup', handler);
    }, [allResults, selectedResult, setSelectedResult]);

    return containerRef;
}

function Results({posts, authors, tags}) {
    const {searchValue} = useContext(AppContext);

    const allResults = useMemo(() => [...authors, ...tags, ...posts], [authors, tags