# Refactored Search Popup Component

## Key Changes Made

1. **Converted class components to functional components** - `PopupModal` and `PopupContent` converted to hooks-based components
2. **Extracted custom hooks** - `useKeyboardNavigation`, `useSearchResults`, `useEscapeKey` for reusable logic
3. **Eliminated duplicate code** - `handlePopupClose`, keyboard event patterns, invalid URL filtering
4. **Simplified `StylesWrapper`** - converted to a plain constant
5. **Simplified `HighlightedSection`** - reduced branching complexity
6. **Extracted shared constants** - `INVALID_URL_REGEX`, `RESULT_ITEM_BASE_CLASS`
7. **Replaced nested `PostItems` function** - moved inline

```javascript
import AppContext from '../app-context';
import Frame from './frame';
import React, {useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {ReactComponent as CircleAnimated} from '../icons/circle-anim.svg';
import {ReactComponent as ClearIcon} from '../icons/clear.svg';
import {ReactComponent as SearchIcon} from '../icons/search.svg';

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_MAX_POSTS = 10;
const STEP_MAX_POSTS = 10;
const INVALID_URL_REGEX = /\/404\/$/;

const MODAL_STYLES = {
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

// ─── Custom Hooks ─────────────────────────────────────────────────────────────

function useCloseOnEscape(dispatch) {
    const containerRef = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') {
                dispatch('update', {showPopup: false});
            }
        };
        const doc = containerRef.current?.ownerDocument;
        doc?.addEventListener('keyup', handler);
        return () => doc?.removeEventListener('keyup', handler);
    }, [dispatch]);

    return containerRef;
}

function useKeyboardNavigation(allResults, selectedResult, setSelectedResult) {
    const containerRef = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            const currentIdx = allResults.findIndex(r => r.id === selectedResult);

            if (e.key === 'ArrowUp' && currentIdx > 0) {
                setSelectedResult(allResults[currentIdx - 1].id);
            } else if (e.key === 'ArrowDown' && currentIdx < allResults.length - 1) {
                setSelectedResult(allResults[currentIdx + 1].id);
            } else if (e.key === 'Enter') {
                const result = allResults.find(r => r.id === selectedResult);
                if (result?.url) {
                    window.location.href = result.url;
                }
            }
        };

        const doc = containerRef.current?.ownerDocument;
        doc?.addEventListener('keyup', handler);
        return () => doc?.removeEventListener('keyup', handler);
    }, [allResults, selectedResult, setSelectedResult]);

    return containerRef;
}

function useSearchResults() {
    const {searchValue = '', searchIndex, indexComplete} = useContext(AppContext);

    return useMemo(() => {
        if (!indexComplete || !searchValue) {
            return {filteredPosts: [], filteredAuthors: [], filteredTags: []};
        }

        const results = searchIndex?.search(searchValue) ?? {};
        const isValidUrl = item => !(item?.url && INVALID_URL_REGEX.test(item.url));

        return {
            filteredPosts: results.posts ?? [],
            filteredAuthors: (results.authors ?? []).filter(isValidUrl),
            filteredTags: (results.tags ?? []).filter(isValidUrl)
        };
    }, [searchValue, searchIndex, indexComplete]);
}

// ─── Utility Functions ────────────────────────────────────────────────────────

function buildHighlightRegex(highlight) {
    const pattern = highlight
        .split(' ')
        .map(word => word.replace(/\W/g, '\\&'))
        .map(escaped => `^${escaped}|\\s${escaped}`)
        .join('|');
    return new RegExp(pattern, 'ig');
}

function getMatchIndexes(text, highlight) {
    if (!text || !highlight) {
        return [];
    }
    const regex = buildHighlightRegex(highlight);
    return [...text.matchAll(regex)].map(match => ({
        startIdx: match.index,
        endIdx: match.index + match[0].length
    }));
}

function getHighlightParts(text, highlight) {
    const indexes = getMatchIndexes(text, highlight);
    const parts = [];
    let lastIdx = 0;

    for (const {startIdx, endIdx} of indexes) {
        if (lastIdx < startIdx) {
            parts.push({text: text.slice(lastIdx, startIdx), type: 'normal'});
        }
        parts.push({text: text.slice(startIdx, endIdx), type: 'highlight'});
        lastIdx = endIdx;
    }

    if (lastIdx < text.length) {
        parts.push({text: text.slice(lastIdx), type: 'normal'});
    }

    return {parts, highlightIndexes: indexes};
}

function navigateToUrl(url) {
    if (url) {
        window.location.href = url;
    }
}

function useDispatchClose() {
    const {dispatch} = useContext(AppContext);
    return useCallback(() => dispatch('update', {showPopup: false}), [dispatch]);
}

function getResultItemClass(id, selectedResult, base) {
    return id === selectedResult ? `${base} bg-neutral-100` : base;
}

// ─── Small UI Components ──────────────────────────────────────────────────────

function Loading() {
    const {indexComplete, searchValue} = useContext(AppContext);
    return (!indexComplete && searchValue)
        ? <CircleAnimated className='shrink-0' />
        : null;
}

function CancelButton() {
    const {t} = useContext(AppContext);
    const close = useDispatchClose();
    return (
        <button className='ms-3 text-sm text-neutral-500 sm:hidden' alt='Cancel' onClick={close}>
            {t('Cancel')}
        </button>
    );
}

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

function NoResultsBox() {
    const {t} = useContext(AppContext);
    return (
        <div className='py-4 px-7'>
            <p className='text-[1.65rem] text-neutral-400 leading-normal'>{t('No matches found')}</p>
        </div>
    );
}

function HighlightWord({word, isExcerpt}) {
    const className = isExcerpt ? 'font-bold' : 'font-bold text-neutral-900';
    return <span className={className}>{word}</span>;
}

function SectionHeader({label}) {
    return (
        <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>
            {label}
        </h1>
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

// ─── Highlighted Text ─────────────────────────────────────────────────────────

function HighlightedSection({text = '', highlight = '', isExcerpt}) {
    let resolvedText = text || '';
    const {parts, highlightIndexes} = getHighlightParts(resolvedText, highlight || '');

    let finalParts = parts;
    if (isExcerpt && highlightIndexes[0]?.startIdx > 50) {
        const trimmed = '...' + resolvedText.slice(highlightIndexes[0].startIdx - 20);
        finalParts = getHighlightParts(trimmed, highlight).parts;
    }

    return (
        <>
            {finalParts.map((part, idx) =>
                part.type === 'highlight'
                    ? <HighlightWord key={idx} word={part.text} isExcerpt={isExcerpt} />
                    : <React.Fragment key={idx}>{part.text}</React.Fragment>
            )}
        </>
    );
}

// ─── List Items ───────────────────────────────────────────────────────────────

function TagListItem({tag, selectedResult, setSelectedResult}) {
    const {name, url, id} = tag;
    const className = getResultItemClass(
        id, selectedResult,
        'flex items-center py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer'
    );
    return (
        <div className={className} onClick={() => navigateToUrl(url)} onMouseEnter={() => setSelectedResult(id)}>
            <p className='me-2 text-sm font-bold text-neutral-400'>#</p>
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{name}</h2>
        </div>
    );
}

function PostListItem({post, selectedResult, setSelectedResult}) {
    const {searchValue} = useContext(AppContext);
    const {title, excerpt, url, id} = post;
    const className = getResultItemClass(
        id, selectedResult,
        'py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer'
    );
    return (
        <div className={className} onClick={() => navigateToUrl(url)} onMouseEnter={() => setSelectedResult(id)}>
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-800'>
                <HighlightedSection text={title} highlight={searchValue} isExcerpt={false} />
            </h2>
            <p className='text-neutral-400 leading-normal text-sm mt-0 mb-0 truncate'>
                <HighlightedSection text={excerpt} highlight={searchValue} isExcerpt={true} />
            </p>
        </div>
    );
}

function AuthorListItem({author, selectedResult, setSelectedResult}) {
    const {name, profile_image: profileImage, url, id} = author;
    const className = getResultItemClass(
        id, selectedResult,
        'py-[1rem] -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer flex items-center'
    );
    return (
        <div className={className} onClick={() => navigateToUrl(url)} onMouseEnter={() => setSelectedResult(id)}>
            <AuthorAvatar name={name} avatar={profileImage} />
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{name}</h2>
        </div>
    );
}

// ─── Result Sections ──────────────────────────────────────────────────────────

function TagResults({tags, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);
    if (!tags?.length) {
        return null;
    }
    return (
        <div className='border-t border-gray-200 py-3 px-4 sm:px-7'>
            <SectionHeader label={t('Tags')} />
            {tags.map(tag => (
                <TagListItem key={tag.name} tag={tag} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
        </div>
    );
}

function AuthorResults({authors, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);
    if (!authors?.length) {
        return null;
    }
    return (
        <div className='border-t border-neutral-200 py-3 px-4 sm:px-7'>
            <SectionHeader label={t('Authors')} />
            {authors.map(author => (
                <AuthorListItem key={author.name} author={author} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
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

function PostResults({posts, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);
    const [maxPosts, setMaxPosts] = useState(DEFAULT_MAX_POSTS);

    useEffect(() => {
        setMaxPosts(DEFAULT_MAX_POSTS);
    }, [posts]);

    if (!posts?.length) {
        return null;
    }

    const visiblePosts = posts.slice(0, maxPosts + 1);

    return (
        <div className='border-t border-neutral-200 py-3 px-4 sm:px-7'>
            <SectionHeader label={t('Posts')} />
            {visiblePosts.map(post => (
                <PostListItem key={post.title} post={post} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
            <ShowMoreButton setMaxPosts={setMaxPosts} maxPosts={maxPosts} posts={posts} />
        </div>
    );
}

// ─── Search Box & Results ─────────────────────────────────────────────────────

function SearchBox() {
    const {searchValue, dispatch, inputRef, t} = useContext(AppContext);
    const containerRef = useCloseOnEscape(dispatch);

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
                onChange={e => dispatch('update', {searchValue: e.target.value})}
                onKeyDown={e => {
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

function Results({posts, authors, tags}) {
    const {searchValue} = useContext(AppContext);

    const allResults = useMemo(() => [...authors, ...tags, ...posts], [authors, tags, posts]);
    const [selectedResult, setSelectedResult] = useState(allResults[0]?.id ?? null);

    useEffect(() => {
        setSelectedResult(allResults[0]?.id ?? null);
    }, [allResults]);

    const containerRef = useKeyboardNavigation(allResults, selectedResult, setSelectedResult);

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

function SearchResultBox() {
    const {searchValue} = useContext(AppContext);
    const {filteredPosts, filteredAuthors, filteredTags} = useSearchResults();
    const hasResults = filteredPosts.length || filteredAuthors.length || filteredTags.length;

    if (hasResults) {
        return <Results posts={filteredPosts} authors={filteredAuthors} tags={filteredTags} />;
    }
    if (searchValue) {
        return <NoResultsBox />;
    }
    return null;
}

function Search() {
    const close = useDispatchClose();
    return (
        <div
            className='h-screen w-screen pt-20 antialiased z-50 relative ghost-display'
            onClick={e => e.target === e.currentTarget && close()}
        >
            <div className='bg-white w-full max-w-[95vw] sm:max-w-lg rounded-lg shadow-xl m-auto relative translate-z-0 animate-popup'>
                <SearchBox />
                <SearchResultBox />
            </div>
        </div>
    );
}

// ─── Frame Styles ─────────────────────────────────────────────────────────────

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

// ─── Modal ────────────────────────────────────────────────────────────────────

function PopupModal() {
    const {showPopup, brandColor, stylesUrl, dir, dispatch} = useContext(AppContext);

    const handleBackdropClick = useCallback((e) => {
        e.preventDefault();
        if (e.target === e.currentTarget) {
            dispatch('update', {showPopup: false});
        }
    }, [dispatch]);

    if (!showPopup) {
        return null;
    }

    return (
        <div style={MODAL_STYLES.modalContainer} className='gh-root-frame'>
            <Frame style={MODAL_STYLES.frame} title='portal-popup' head={<FrameStyles brandColor={brandColor} stylesUrl={stylesUrl} />} searchdir={dir}>
                <div
                    onClick={handleBackdropClick}
                    className='absolute top-0 bottom-0 left-0 right-0 block backdrop-blur-[2px] animate-fadein z-0 bg-gradient-to-br from-[rgba(0,0,0,0.2)] to-[rgba(0,0,0,0.1)]'
                />
                <Search />
            </Frame>
        </div>
    );
}

export default PopupModal;
```

## Summary of Improvements

| Area | Before | After |
|------|--------|-------|
| Class components | 2 (`PopupModal`, `PopupContent`) | 0 — all functional |
| Duplicate `handlePopupClose` | Defined in 2 places | Single `useDispatchClose` hook |
| Keyboard event setup | Copy-pasted in 2 components | `useCloseOnEscape` + `useKeyboardNavigation` hooks |
| URL filtering | Inline regex in `SearchResultBox` | `INVALID_URL_REGEX` constant + `useSearchResults` hook |
| `StylesWrapper` | Function returning object | Plain `MODAL_STYLES` constant |
| `FrameStyles` | Inline render method with branching | Dedicated component, conditional `stylesUrl` link |
| `SectionHeader` | Repeated `<h1>` markup in 3 places | Shared `SectionHeader` component |
| `getResultItemClass` | Repeated string concatenation | Shared utility function |
| `PostItems` | Nested function inside render | Inline `map` |
| `navigateToUrl` | Repeated `if (url) window.location.href` | Shared utility function |