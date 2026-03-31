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

// Utility: CSS class builder for list items
const buildListItemClass = (baseClass, id, selectedResult) =>
    id === selectedResult ? `${baseClass} bg-neutral-100` : baseClass;

// Utility: Navigate to URL
const navigateTo = (url) => {
    if (url) {
        window.location.href = url;
    }
};

// Utility: Escape regex special characters
const escapeRegex = (str) => String(str).replace(/\W/g, '\\&');

// Utility: Build highlight regex from search terms
const buildHighlightRegex = (highlight) => {
    const pattern = highlight
        .split(' ')
        .map((word, idx) => {
            const escaped = escapeRegex(word);
            return idx === 0 ? `^${escaped}|\\s${escaped}` : `^${escaped}|\\s${escaped}`;
        })
        .join('|');
    return new RegExp(pattern, 'ig');
};

// Utility: Get match indexes for highlighting
function getMatchIndexes({text, highlight}) {
    if (!text || !highlight) {
        return [];
    }
    const matchRegex = buildHighlightRegex(highlight);
    const matches = text.matchAll(matchRegex);
    return Array.from(matches).map((match) => ({
        startIdx: match.index,
        endIdx: (match.index || 0) + (match[0]?.length || 0)
    }));
}

// Utility: Split text into highlighted/normal parts
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

// Hook: Keyboard event listener on document
function useDocumentKeyUp(handler, deps = []) {
    const containerRef = useRef(null);

    useEffect(() => {
        const node = containerRef?.current?.ownerDocument || document;
        node.addEventListener('keyup', handler);
        return () => node.removeEventListener('keyup', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handler, ...deps]);

    return containerRef;
}

// Hook: Filter invalid URLs from results
function useFilteredResults(searchValue, searchIndex, indexComplete) {
    return useMemo(() => {
        if (!indexComplete || !searchValue) {
            return {filteredPosts: [], filteredAuthors: [], filteredTags: []};
        }

        const results = searchIndex?.search(searchValue) || {};
        const filterInvalid = (items) =>
            (items || []).filter((item) => !(item?.url && INVALID_URL_REGEX.test(item.url)));

        return {
            filteredPosts: results.posts || [],
            filteredAuthors: filterInvalid(results.authors),
            filteredTags: filterInvalid(results.tags)
        };
    }, [searchValue, searchIndex, indexComplete]);
}

// Component: Frame styles renderer
function FrameStyles({brandColor, stylesUrl}) {
    const styles = `
        :root { --brandcolor: ${brandColor || ''} }
        .ghost-display { display: none; }
    `;

    return (
        <>
            {stylesUrl && <link rel='stylesheet' href={stylesUrl} />}
            <style dangerouslySetInnerHTML={{__html: styles}} />
            <meta name='viewport' content='width=device-width, initial-scale=1, maximum-scale=1' />
        </>
    );
}

// Component: Search/Clear icon toggle
function SearchClearIcon() {
    const {searchValue = '', dispatch} = useContext(AppContext);

    if (!searchValue) {
        return <SearchIcon className='text-neutral-900' alt='Search' />;
    }

    return (
        <button
            alt='Clear'
            className='-mb-[1px]'
            onClick={() => dispatch('update', {searchValue: ''})}
        >
            <ClearIcon className='text-neutral-900 hover:text-neutral-500 h-[1.1rem] w-[1.1rem]' />
        </button>
    );
}

// Component: Loading spinner
function Loading() {
    const {indexComplete, searchValue} = useContext(AppContext);
    return (!indexComplete && searchValue) ? <CircleAnimated className='shrink-0' /> : null;
}

// Component: Cancel button
function CancelButton() {
    const {dispatch, t} = useContext(AppContext);
    return (
        <button
            className='ms-3 text-sm text-neutral-500 sm:hidden'
            alt='Cancel'
            onClick={() => dispatch('update', {showPopup: false})}
        >
            {t('Cancel')}
        </button>
    );
}

// Component: Search input box
function SearchBox() {
    const {searchValue, dispatch, inputRef, t} = useContext(AppContext);

    const handleKeyUp = useCallback((event) => {
        if (event.key === 'Escape') {
            dispatch('update', {showPopup: false});
        }
    }, [dispatch]);

    const containerRef = useDocumentKeyUp(handleKeyUp);

    useEffect(() => {
        const timer = setTimeout(() => inputRef?.current?.focus(), 150);
        return () => clearTimeout(timer);
    }, [inputRef]);

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
                onChange={(e) => dispatch('update', {searchValue: e.target.value})}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                    }
                }}
                className='grow -my-5 py-5 -ms-3 ps-3 text-[1.65rem] focus-visible:outline-none placeholder:text-gray-400 outline-none truncate'
                placeholder={t('Search posts, tags and authors')}
            />
            <Loading />
            <CancelButton />
        </div>
    );
}

// Component: Highlighted word
function HighlightWord({word, isExcerpt}) {
    const className = isExcerpt ? 'font-bold' : 'font-bold text-neutral-900';
    return <span className={className}>{word}</span>;
}

// Component: Text with highlighted search matches
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

// Component: Clickable list item wrapper
function ResultListItem({className, url, id, setSelectedResult, children}) {
    return (
        <div
            className={className}
            onClick={() => navigateTo(url)}
            onMouseEnter={() => setSelectedResult(id)}
        >
            {children}
        </div>
    );
}

// Component: Tag list item
function TagListItem({tag, selectedResult, setSelectedResult}) {
    const {name, url, id} = tag;
    const className = buildListItemClass(
        'flex items-center py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer',
        id,
        selectedResult
    );

    return (
        <ResultListItem className={className} url={url} id={id} setSelectedResult={setSelectedResult}>
            <p className='me-2 text-sm font-bold text-neutral-400'>#</p>
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{name}</h2>
        </ResultListItem>
    );
}

// Component: Tag results section
function TagResults({tags, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);

    if (!tags?.length) {
        return null;
    }

    return (
        <div className='border-t border-gray-200 py-3 px-4 sm:px-7'>
            <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>{t('Tags')}</h1>
            {tags.map((tag) => (
                <TagListItem key={tag.name} tag={tag} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
        </div>
    );
}

// Component: Author avatar
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

// Component: Author list item
function AuthorListItem({author, selectedResult, setSelectedResult}) {
    const {name, profile_image: profileImage, url, id} = author;
    const className = buildListItemClass(
        'py-[1rem] -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer flex items-center',
        id,
        selectedResult
    );

    return (
        <ResultListItem className={className} url={url} id={id} setSelectedResult={setSelectedResult}>
            <AuthorAvatar name={name} avatar={profileImage} />
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{name}</h2>
        </ResultListItem>
    );
}

// Component: Author results section
function AuthorResults({authors, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);

    if (!authors?.length) {
        return null;
    }

    return (
        <div className='border-t border-neutral-200 py-3 px-4 sm:px-7'>
            <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>{t('Authors')}</h1>
            {authors.map((author) => (
                <AuthorListItem key={author.name} author={author} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
        </div>
    );
}

// Component: Post list item
function PostListItem({post, selectedResult, setSelectedResult}) {
    const {searchValue} = useContext(AppContext);
    const {title, excerpt, url, id} = post;
    const className = buildListItemClass(
        'py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer',
        id,
        selectedResult
    );

    return (
        <ResultListItem className={className} url={url} id={id} setSelectedResult={setSelectedResult}>
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-800'>
                <HighlightedSection text={title} highlight={searchValue} isExcerpt={false} />
            </h2>
            <p className='text-neutral-400 leading-normal text-sm mt-0 mb-0 truncate'>
                <HighlightedSection text={excerpt} highlight={searchValue} isExcerpt={true} />
            </p>
        </ResultListItem>
    );
}

// Component: Show more posts button
function ShowMoreButton({posts, maxPosts, setMaxPosts}) {
    const {t} = useContext(AppContext);

    if (!posts?.length || maxPosts >= posts.length) {
        return null;
    }

    return (
        <button
            className='w-full my-3 p-[1rem] border border-neutral-200 hover:border-neutral-300 text-neutral-800 hover:text-black font-semibold rounded transition duration-150 ease hover:ease'
            onClick={() => setMaxPosts((prev) => prev + STEP_MAX_POSTS)}
        >
            {t('Show more results')}
        </button>
    );
}

// Component: Post results section with pagination
function PostResults({posts, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);
    const [maxPosts, setMaxPosts] = useState(DEFAULT_MAX_POSTS);

    useEffect(() => {
        setMaxPosts(DEFAULT_MAX_POSTS);
    }, [posts]);

    if (!posts?.length) {
        return null;
    }

    const paginatedPosts = posts.slice(0, maxPosts + 1);

    return (
        <div className='border-t border-neutral-200 py-3 px-4 sm:px-7'>
            <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>{t('Posts')}</h1>
            {paginatedPosts.map((post) => (