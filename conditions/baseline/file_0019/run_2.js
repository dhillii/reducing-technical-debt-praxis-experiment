Here's the refactored code with reduced complexity, improved readability, and modern React patterns:

```javascript
import AppContext from '../app-context';
import Frame from './frame';
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ReactComponent as CircleAnimated } from '../icons/circle-anim.svg';
import { ReactComponent as ClearIcon } from '../icons/clear.svg';
import { ReactComponent as SearchIcon } from '../icons/search.svg';

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

// Custom Hooks
function useKeyUpHandler(handler, deps = []) {
    const containerRef = useRef(null);

    useEffect(() => {
        const node = containerRef?.current?.ownerDocument ?? document;
        node.addEventListener('keyup', handler);
        return () => node.removeEventListener('keyup', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handler, ...deps]);

    return containerRef;
}

function useDispatch() {
    const { dispatch } = useContext(AppContext);
    return (updates) => dispatch('update', updates);
}

function useClosePopup() {
    const update = useDispatch();
    return () => update({ showPopup: false });
}

// Utility Functions
function buildHighlightRegex(highlight) {
    return highlight
        .split(' ')
        .map((word, idx) => {
            const escaped = String(word).replace(/\W/g, '\\&');
            return idx === 0 ? `^${escaped}|\\s${escaped}` : `|^${escaped}|\\s${escaped}`;
        })
        .join('');
}

function getMatchIndexes({ text, highlight }) {
    if (!text || !highlight) {
        return [];
    }
    const regex = new RegExp(buildHighlightRegex(highlight), 'ig');
    return [...text.matchAll(regex)].map(match => ({
        startIdx: match.index,
        endIdx: (match.index || 0) + (match[0]?.length || 0)
    }));
}

function getHighlightParts({ text, highlight }) {
    const highlightIndexes = getMatchIndexes({ text, highlight });
    const parts = [];
    let lastIdx = 0;

    highlightIndexes.forEach(({ startIdx, endIdx }) => {
        if (lastIdx !== startIdx) {
            parts.push({ text: text.slice(lastIdx, startIdx), type: 'normal' });
        }
        parts.push({ text: text.slice(startIdx, endIdx), type: 'highlight' });
        lastIdx = endIdx;
    });

    if (lastIdx < text?.length) {
        parts.push({ text: text.slice(lastIdx), type: 'normal' });
    }

    return { parts, highlightIndexes };
}

function filterInvalidUrls(items) {
    return items.filter(item => !(item?.url && INVALID_URL_REGEX.test(item.url)));
}

function navigateTo(url) {
    if (url) {
        window.location.href = url;
    }
}

// Shared Components
function ResultItem({ className, id, url, selectedResult, setSelectedResult, children }) {
    const isSelected = id === selectedResult;
    return (
        <div
            className={`${className}${isSelected ? ' bg-neutral-100' : ''}`}
            onClick={() => navigateTo(url)}
            onMouseEnter={() => setSelectedResult(id)}
        >
            {children}
        </div>
    );
}

function SectionHeader({ label }) {
    return (
        <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>
            {label}
        </h1>
    );
}

function ResultsSection({ title, children }) {
    return (
        <div className='border-t border-neutral-200 py-3 px-4 sm:px-7'>
            <SectionHeader label={title} />
            {children}
        </div>
    );
}

// Search Components
function HighlightWord({ word, isExcerpt }) {
    const className = isExcerpt ? 'font-bold' : 'font-bold text-neutral-900';
    return <span className={className}>{word}</span>;
}

function HighlightedSection({ text = '', highlight = '', isExcerpt }) {
    let { parts, highlightIndexes } = getHighlightParts({ text, highlight });

    if (isExcerpt && highlightIndexes?.[0]?.startIdx > 50) {
        const trimmedText = '...' + text.slice(highlightIndexes[0].startIdx - 20);
        ({ parts } = getHighlightParts({ text: trimmedText, highlight }));
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

function SearchClearIcon() {
    const { searchValue = '' } = useContext(AppContext);
    const update = useDispatch();

    if (!searchValue) {
        return <SearchIcon className='text-neutral-900' alt='Search' />;
    }

    return (
        <button alt='Clear' className='-mb-[1px]' onClick={() => update({ searchValue: '' })}>
            <ClearIcon className='text-neutral-900 hover:text-neutral-500 h-[1.1rem] w-[1.1rem]' />
        </button>
    );
}

function Loading() {
    const { indexComplete, searchValue } = useContext(AppContext);
    return (!indexComplete && searchValue) ? <CircleAnimated className='shrink-0' /> : null;
}

function CancelButton() {
    const { t } = useContext(AppContext);
    const closePopup = useClosePopup();

    return (
        <button
            className='ms-3 text-sm text-neutral-500 sm:hidden'
            alt='Cancel'
            onClick={closePopup}
        >
            {t('Cancel')}
        </button>
    );
}

function SearchBox() {
    const { searchValue, inputRef, t } = useContext(AppContext);
    const update = useDispatch();
    const closePopup = useClosePopup();

    useEffect(() => {
        const timer = setTimeout(() => inputRef?.current?.focus(), 150);
        return () => clearTimeout(timer);
    }, [inputRef]);

    const containerRef = useKeyUpHandler((event) => {
        if (event.key === 'Escape') {
            closePopup();
        }
    });

    const className = `z-10 relative flex items-center py-5 px-4 sm:px-7 bg-white ${searchValue ? 'rounded-t-lg shadow' : 'rounded-lg'}`;

    return (
        <div className={className} ref={containerRef}>
            <div className='flex items-center justify-center w-4 h-4 me-3'>
                <SearchClearIcon />
            </div>
            <input
                ref={inputRef}
                value={searchValue || ''}
                onChange={e => update({ searchValue: e.target.value })}
                onKeyDown={e => ['ArrowUp', 'ArrowDown'].includes(e.key) && e.preventDefault()}
                className='grow -my-5 py-5 -ms-3 ps-3 text-[1.65rem] focus-visible:outline-none placeholder:text-gray-400 outline-none truncate'
                placeholder={t('Search posts, tags and authors')}
            />
            <Loading />
            <CancelButton />
        </div>
    );
}

// List Items
function TagListItem({ tag, selectedResult, setSelectedResult }) {
    const { name, url, id } = tag;
    return (
        <ResultItem
            className='flex items-center py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer'
            id={id}
            url={url}
            selectedResult={selectedResult}
            setSelectedResult={setSelectedResult}
        >
            <p className='me-2 text-sm font-bold text-neutral-400'>#</p>
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{name}</h2>
        </ResultItem>
    );
}

function PostListItem({ post, selectedResult, setSelectedResult }) {
    const { searchValue } = useContext(AppContext);
    const { title, excerpt, url, id } = post;
    return (
        <ResultItem
            className='py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer'
            id={id}
            url={url}
            selectedResult={selectedResult}
            setSelectedResult={setSelectedResult}
        >
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-800'>
                <HighlightedSection text={title} highlight={searchValue} isExcerpt={false} />
            </h2>
            <p className='text-neutral-400 leading-normal text-sm mt-0 mb-0 truncate'>
                <HighlightedSection text={excerpt} highlight={searchValue} isExcerpt={true} />
            </p>
        </ResultItem>
    );
}

function AuthorAvatar({ name, avatar }) {
    if (avatar?.length) {
        return <img className='rounded-full bg-neutral-300 w-7 h-7 me-2 object-cover' src={avatar} alt={name} />;
    }
    return (
        <div className='rounded-full bg-neutral-200 w-7 h-7 me-2 flex items-center justify-center font-bold'>
            <span className='text-neutral-400'>{name.charAt(0)}</span>
        </div>
    );
}

function AuthorListItem({ author, selectedResult, setSelectedResult }) {
    const { name, profile_image: profileImage, url, id } = author;
    return (
        <ResultItem
            className='py-[1rem] -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer flex items-center'
            id={id}
            url={url}
            selectedResult={selectedResult}
            setSelectedResult={setSelectedResult}
        >
            <AuthorAvatar name={name} avatar={profileImage} />
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{name}</h2>
        </ResultItem>
    );
}

// Result Sections
function TagResults({ tags, selectedResult, setSelectedResult }) {
    const { t } = useContext(AppContext);
    if (!tags?.length) {
        return null;
    }
    return (
        <ResultsSection title={t('Tags')}>
            {tags.map(tag => (
                <TagListItem key={tag.name} tag={tag} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
        </ResultsSection>
    );
}

function AuthorResults({ authors, selectedResult, setSelectedResult }) {
    const { t } = useContext(AppContext);
    if (!authors?.length) {
        return null;
    }
    return (
        <ResultsSection title={t('Authors')}>
            {authors.map(author => (
                <AuthorListItem key={author.name} author={author} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
        </ResultsSection>
    );
}

function ShowMoreButton({ posts, maxPosts, setMaxPosts }) {
    const { t } = useContext(AppContext);
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

function PostResults({ posts, selectedResult, setSelectedResult }) {
    const { t } = useContext(AppContext);
    const [maxPosts, setMaxPosts] = useState(DEFAULT_MAX_POSTS);

    useEffect(() => setMaxPosts(DEFAULT_MAX_POSTS), [posts]);

    const paginatedPosts = useMemo(
        () => posts?.slice(0, maxPosts + 1) ?? [],
        [posts, maxPosts]
    );

    if (!posts?.length) {
        return null;
    }

    return (
        <ResultsSection title={t('Posts')}>
            {paginatedPosts.map(post => (
                <PostListItem key={post.title} post={post} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
            <ShowMoreButton setMaxPosts={setMaxPosts} maxPosts={maxPosts} posts={posts} />
        </ResultsSection>
    );
}

function NoResultsBox() {
    const { t } = useContext(AppContext);
    return (
        <div className='py-4 px-7'>
            <p className='text-[1.65rem] text-neutral-400 leading-normal'>{t('No matches found')}</p>
        </div>
    );
}

function useKeyboardNavigation(allResults, selectedResult, setSelectedResult) {
    return useKeyUpHandler((event) => {
        const currentIdx = allResults.findIndex(r => r.id === selectedResult);

        if (event.key === 'ArrowUp' && currentIdx > 0) {
            setSelectedResult(allResults[currentIdx - 1].id);
        } else if (event.key === 'ArrowDown' && currentIdx < allResults.length - 1) {
            setSelectedResult(allResults[currentIdx + 1].id);
        } else if (event.key === 'Enter') {
            navigateTo(allResults[currentIdx]?.url);
        }
    }, [allResults, selectedResult]);
}

function Results({ posts, authors, tags }) {
    const { searchValue } = useContext(AppContext);

    const allResults = useMemo(() => [...authors, ...tags, ...posts], [authors, tags, posts]);
    const [selectedResult, setSelectedResult] = useState(allResults[0]?.id ?? null);

    useEffect(() => {
        setSelectedResult(allResults[0]?.id ?? null);
    }, [allResults]);

    const containerRef = useKeyboardNavigation(allResults, selectedResult, setSelectedResult);

    if (!searchValue) {
        return null;
    }

    const resultProps = { selectedResult, setSelectedResult };

    return (
        <div className='overflow-y-auto max-h-[calc(100vh-172px)] sm:max-h-[70vh] -mt-[1px]' ref={containerRef}>
            <AuthorResults authors={authors} {...resultProps} />
            <TagResults tags={tags} {...resultProps} />
            <PostResults posts={posts} {...resultProps} />
        </div>
    );
}

function SearchResultBox() {
    const { searchValue = '', searchIndex, indexComplete } = useContext(AppContext);

    const searchResults = useMemo(() => {
        if (!indexComplete || !searchValue) {
            return { posts: [], authors: [], tags: [] };
        }
        const results = searchIndex?.search(searchValue) ?? {};
        return {
            posts: results.posts ?? [],
            authors: filterInvalidUrls(results.authors ?? []),
            tags: filterInvalidUrls(results.tags ?? [])
        };
    }, [indexComplete, searchValue, searchIndex]);

    const { posts, authors, tags } = searchResults;
    const hasResults = posts.length || authors.length || tags.length;

    if (hasResults) {
        return <Results posts={posts} authors={authors} tags={tags} />;
    }
    if (searchValue) {
        return <NoResultsBox />;
    }
    return null;
}

function Search() {
    const closePopup = useClosePopup();

    return (
        <div
            className='h-screen w-screen pt-20 antialiased z-50 relative ghost-display'
            onClick={e => e.target === e.currentTarget && closePopup()}
        >
            <div className='bg-white w-full max-w-[95vw] sm:max-w-lg rounded-lg shadow-xl m-auto relative translate-z-0 animate-popup'>
                <SearchBox />
                <SearchResultBox />
            </div>
        </div>
    );
}

// PopupModal
function FrameStyles({ brandColor, stylesUrl }) {
    const styles = `
        :root { --brandcolor: ${brandColor || ''} }
        .ghost-display { display: none; }
    `;

    return (
        <>
            {stylesUrl && <link rel='stylesheet' href={stylesUrl} />}
            <style dangerouslySetInnerHTML={{ __html: styles }} />
            <meta name='viewport' content='width=device-width, initial-scale=1, maximum-scale=1' />
        </>
    );
}

function PopupModal() {
    const context = useContext(AppContext);
    const { showPopup, brandColor, stylesUrl, dir } = context;
    const closePopup = useClosePopup();

    if (!showPopup) {
        return null;
    }

    return (
        <div style={modalStyles.modalContainer} className='gh-root-frame'>
            <Frame style={modalStyles.frame} title='portal-popup' head={<FrameStyles brandColor={brandColor} stylesUrl={stylesUrl} />} searchdir={dir}>
                <div
                    onClick={e => e.target === e.currentTarget && closePopup()}
                    className='absolute top-0 bottom-0 left-0 right-0 block backdrop-blur-[2px] animate-fadein z-0 bg-gradient-to-br from-[rgba(0,0,0,0.2)] to-[rgba(0,0,0,0.1)]'
                />
                <Search />
            </Frame>
        </div>
    );
}

export default PopupModal;
```

Key improvements made:

1. **Eliminated class components** — Converted `PopupModal` and `PopupContent` to functional components, removing boilerplate and lifecycle methods.

2. **Extracted custom hooks** — `useDispatch`, `useClosePopup`, and `useKeyUpHandler` centralize repeated logic, and `useKeyboardNavigation` isolates keyboard handling.

3. **Shared `ResultItem` component** — Eliminated duplicated click/hover/selection logic across `TagListItem`, `PostListItem`, and `AuthorListItem`.

4. **Shared `ResultsSection` component** — Removed duplicated section wrapper markup across `TagResults`, `AuthorResults`, and `PostResults`.

5. **Simplified `getHighlightParts`** — Removed the redundant `if/else` branch by unifying the logic.

6. **Moved search filtering into `useMemo`** — `SearchResultBox` now computes results reactively and cleanly.

7. **Replaced `useState` + `useEffect` with `useMemo`** — `paginatedPosts` in `PostResults` no longer needs a separate state.

8. **Extracted `FrameStyles`** — Isolated frame style rendering into its own component.

9. **Consolidated styles** — Flattened `StylesWrapper` into a plain `modalStyles` object.

10. **Removed dead code** — Eliminated empty `sendContainerHeightChangeEvent` and the now-redundant `PopupContent` wrapper class.