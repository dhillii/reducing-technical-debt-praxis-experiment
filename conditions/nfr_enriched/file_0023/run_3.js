```jsx
import AppContext from '../app-context';
import Frame from './frame';
import React, {useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {ReactComponent as CircleAnimated} from '../icons/circle-anim.svg';
import {ReactComponent as ClearIcon} from '../icons/clear.svg';
import {ReactComponent as SearchIcon} from '../icons/search.svg';

// Constants
const DEFAULT_MAX_POSTS = 10;
const STEP_MAX_POSTS = 10;
const INVALID_URL_REGEX = /\/404\/$/;

// Styles
const modalStyles = {
    modalContainer: {
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

// Utility: CSS class helpers
const listItemBaseClass = (id, selectedResult, extra = '') =>
    `${extra} cursor-pointer -mx-4 sm:-mx-7 px-4 sm:px-7${id === selectedResult ? ' bg-neutral-100' : ''}`;

const sectionHeaderClass = 'uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide';
const sectionContainerClass = 'border-t border-neutral-200 py-3 px-4 sm:px-7';

// Utility: navigate to URL
const navigateTo = (url) => {
    if (url) {
        window.location.href = url;
    }
};

// Utility: filter out invalid URLs
const filterInvalidUrls = (items) =>
    items.filter(item => !(item?.url && INVALID_URL_REGEX.test(item?.url)));

// Utility: highlight text parsing
function buildHighlightRegex(highlight) {
    const parts = highlight?.split(' ') || [];
    const escaped = parts.map(d => String(d).replace(/\W/g, '\\&'));
    return new RegExp(
        escaped.map((e, i) => (i === 0 ? `^${e}|\\s${e}` : `|^${e}|\\s${e}`)).join(''),
        'ig'
    );
}

function getMatchIndexes({text, highlight}) {
    if (!text || !highlight) {
        return [];
    }
    const matchRegex = buildHighlightRegex(highlight);
    return [...(text.matchAll(matchRegex) || [])].map(match => ({
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

// Hooks
function useKeyUpHandler(handler, deps) {
    const ref = useRef(null);
    useEffect(() => {
        const node = ref?.current;
        node?.ownerDocument.addEventListener('keyup', handler);
        return () => node?.ownerDocument.removeEventListener('keyup', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
    return ref;
}

function useDispatchClose() {
    const {dispatch} = useContext(AppContext);
    return useCallback(() => dispatch('update', {showPopup: false}), [dispatch]);
}

// Components: Search Input
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
    return (!indexComplete && searchValue)
        ? <CircleAnimated className='shrink-0' />
        : null;
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
    const closePopup = useDispatchClose();

    const handleKeyUp = useCallback((event) => {
        if (event.key === 'Escape') {
            closePopup();
        }
    }, [closePopup]);

    const containerRef = useKeyUpHandler(handleKeyUp, [handleKeyUp]);

    useEffect(() => {
        const timer = setTimeout(() => inputRef?.current?.focus(), 150);
        return () => clearTimeout(timer);
    }, [inputRef]);

    const className = `z-10 relative flex items-center py-5 px-4 sm:px-7 bg-white ${searchValue ? 'rounded-t-lg shadow' : 'rounded-lg'}`;

    return (
        <div className={className} ref={containerRef}>
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

// Components: Highlight
function HighlightWord({word, isExcerpt}) {
    return (
        <span className={`font-bold${isExcerpt ? '' : ' text-neutral-900'}`}>{word}</span>
    );
}

function HighlightedSection({text = '', highlight = '', isExcerpt}) {
    let resolvedText = text || '';
    const resolvedHighlight = highlight || '';

    let {parts, highlightIndexes} = getHighlightParts({text: resolvedText, highlight: resolvedHighlight});

    if (isExcerpt && highlightIndexes?.[0]?.startIdx > 50) {
        resolvedText = '...' + resolvedText.slice(highlightIndexes[0].startIdx - 20);
        ({parts} = getHighlightParts({text: resolvedText, highlight: resolvedHighlight}));
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

// Components: Result Items
function ResultListItem({className, onClick, onMouseEnter, children}) {
    return (
        <div className={className} onClick={onClick} onMouseEnter={onMouseEnter}>
            {children}
        </div>
    );
}

function TagListItem({tag, selectedResult, setSelectedResult}) {
    const {name, url, id} = tag;
    return (
        <ResultListItem
            className={listItemBaseClass(id, selectedResult, 'flex items-center py-3')}
            onClick={() => navigateTo(url)}
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
    return (
        <ResultListItem
            className={listItemBaseClass(id, selectedResult, 'py-3')}
            onClick={() => navigateTo(url)}
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
    return (
        <ResultListItem
            className={listItemBaseClass(id, selectedResult, 'py-[1rem] flex items-center')}
            onClick={() => navigateTo(url)}
            onMouseEnter={() => setSelectedResult(id)}
        >
            <AuthorAvatar name={name} avatar={profileImage} />
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{name}</h2>
        </ResultListItem>
    );
}

// Components: Result Sections
function ResultSection({title, children}) {
    return (
        <div className={sectionContainerClass}>
            <h1 className={sectionHeaderClass}>{title}</h1>
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

function ShowMoreButton({posts, maxPosts, setMaxPosts}) {
    const {t} = useContext(AppContext);
    if (!posts?.length || maxPosts >= posts?.length) {
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
        <ResultSection title={t('Posts')}>
            {paginatedPosts.map(post => (
                <PostListItem key={post.title} post={post} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
            <ShowMoreButton setMaxPosts={setMaxPosts} maxPosts={maxPosts} posts={posts} />
        </ResultSection>
    );
}

// Components: Results Container
function Results({posts, authors, tags}) {
    const {searchValue} = useContext(AppContext);

    const allResults = useMemo(() => [...authors, ...tags, ...posts], [authors, tags, posts]);

    const [selectedResult, setSelectedResult] = useState(allResults?.[0]?.id || null);

    useEffect(() => {
        setSelectedResult(allResults?.[0]?.id || null);
    }, [allResults]);

    const handleKeyUp = useCallback((event) => {
        const currentIdx = allResults.findIndex(d => d.id === selectedResult);
        const prev = allResults[currentIdx - 1];
        const next = allResults[currentIdx + 1];

        if (event.key === 'ArrowUp' && prev) {
            setSelectedResult(prev.id);
        } else if (event.key === 'ArrowDown' && next) {
            setSelectedResult(next.id);
        } else if (event.key === 'Enter') {
            navigateTo(allResults.find(d => d.id === selectedResult)?.url);
        }
    }, [allResults, selectedResult]);

    const containerRef = useKeyUpHandler(handleKeyUp, [handleKeyUp]);

    if (!searchValue) {
        return null;
    }

    return (
        <div className='overflow-y-auto max-h-[calc(100vh-172px)] sm:max-h-[70vh] -mt-[1px]' ref={containerRef}>
            <AuthorResults authors={authors} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            <TagResults tags={tags} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            <PostResults posts={posts} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
        </div>
    );
}

function NoResultsBox() {
    const {t} = useContext(AppContext);
    return (
        <div className='py-4 px-7'>
            <p