```javascript
import AppContext from '../app-context';
import Frame from './frame';
import React, {useContext, useEffect, useMemo, useRef, useState} from 'react';
import {ReactComponent as CircleAnimated} from '../icons/circle-anim.svg';
import {ReactComponent as ClearIcon} from '../icons/clear.svg';
import {ReactComponent as SearchIcon} from '../icons/search.svg';

const DEFAULT_MAX_POSTS = 10;
const STEP_MAX_POSTS = 10;
const INVALID_URL_REGEX = /\/404\/$/;
const EXCERPT_CONTEXT_LENGTH = 20;
const EXCERPT_MIN_START_IDX = 50;
const ARROW_UP = 'ArrowUp';
const ARROW_DOWN = 'ArrowDown';
const ESCAPE = 'Escape';
const ENTER = 'Enter';

// Styles
const MODAL_CONTAINER_STYLE = {
    zIndex: '3999999',
    position: 'fixed',
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    overflow: 'hidden'
};

const FRAME_STYLE = {
    margin: 'auto',
    position: 'relative',
    padding: '0',
    outline: '0',
    width: '100%',
    opacity: '1',
    overflow: 'hidden',
    height: '100%'
};

// Utility Functions
const isValidUrl = (url) => url && !INVALID_URL_REGEX.test(url);

const filterValidResults = (results) => results.filter(item => isValidUrl(item?.url));

const escapeRegexSpecialChars = (str) => String(str).replace(/\W/g, '\\&');

const buildHighlightRegex = (highlight) => {
    const parts = highlight?.split(' ') || [];
    const regexParts = parts.map((part, idx) => {
        const escaped = escapeRegexSpecialChars(part);
        return idx > 0 ? `|^${escaped}|\\s${escaped}` : `^${escaped}|\\s${escaped}`;
    });
    return new RegExp(regexParts.join(''), 'ig');
};

const getMatchIndexes = ({text, highlight}) => {
    if (!text || !highlight) return [];
    
    const matchRegex = buildHighlightRegex(highlight);
    const matches = text.matchAll(matchRegex);
    
    return Array.from(matches).map(match => ({
        startIdx: match.index,
        endIdx: (match.index || 0) + (match[0]?.length || 0)
    }));
};

const getHighlightParts = ({text, highlight}) => {
    const highlightIndexes = getMatchIndexes({text, highlight});
    const parts = [];
    let lastIdx = 0;

    highlightIndexes.forEach((highlightIdx) => {
        if (lastIdx === highlightIdx.startIdx) {
            parts.push({
                text: text.slice(highlightIdx.startIdx, highlightIdx.endIdx),
                type: 'highlight'
            });
        } else {
            if (lastIdx < highlightIdx.startIdx) {
                parts.push({
                    text: text.slice(lastIdx, highlightIdx.startIdx),
                    type: 'normal'
                });
            }
            parts.push({
                text: text.slice(highlightIdx.startIdx, highlightIdx.endIdx),
                type: 'highlight'
            });
        }
        lastIdx = highlightIdx.endIdx;
    });

    if (lastIdx < text.length) {
        parts.push({
            text: text.slice(lastIdx),
            type: 'normal'
        });
    }

    return {parts, highlightIndexes};
};

const useKeyboardNavigation = (allResults, selectedResult, setSelectedResult, containerRef) => {
    useEffect(() => {
        const handleKeyUp = (event) => {
            const selectedIdx = allResults.findIndex(d => d.id === selectedResult);
            
            if (event.key === ARROW_UP && selectedIdx > 0) {
                setSelectedResult(allResults[selectedIdx - 1].id);
            } else if (event.key === ARROW_DOWN && selectedIdx < allResults.length - 1) {
                setSelectedResult(allResults[selectedIdx + 1].id);
            } else if (event.key === ENTER) {
                const selectedItem = allResults.find(d => d.id === selectedResult);
                if (selectedItem?.url) {
                    window.location.href = selectedItem.url;
                }
            }
        };

        const node = containerRef?.current;
        node?.ownerDocument?.addEventListener('keyup', handleKeyUp);
        
        return () => {
            node?.ownerDocument?.removeEventListener('keyup', handleKeyUp);
        };
    }, [allResults, selectedResult, setSelectedResult, containerRef]);
};

const useEscapeKeyHandler = (inputRef, dispatch) => {
    useEffect(() => {
        const handleKeyUp = (event) => {
            if (event.key === ESCAPE) {
                dispatch('update', {showPopup: false});
            }
        };

        document.addEventListener('keyup', handleKeyUp);
        return () => {
            document.removeEventListener('keyup', handleKeyUp);
        };
    }, [dispatch]);

    useEffect(() => {
        const timer = setTimeout(() => {
            inputRef?.current?.focus();
        }, 150);
        return () => clearTimeout(timer);
    }, [inputRef]);
};

// Components
function HighlightWord({word, isExcerpt}) {
    const className = isExcerpt ? 'font-bold' : 'font-bold text-neutral-900';
    return <span className={className}>{word}</span>;
}

function HighlightedSection({text = '', highlight = '', isExcerpt}) {
    let {parts, highlightIndexes} = getHighlightParts({text, highlight});
    
    if (isExcerpt && highlightIndexes?.[0]) {
        const startIdx = highlightIndexes[0].startIdx;
        if (startIdx > EXCERPT_MIN_START_IDX) {
            const truncatedText = '...' + text.slice(startIdx - EXCERPT_CONTEXT_LENGTH);
            const {parts: updatedParts} = getHighlightParts({text: truncatedText, highlight});
            parts = updatedParts;
        }
    }

    return (
        <>
            {parts.map((part, idx) => (
                <React.Fragment key={idx}>
                    {part.type === 'highlight' ? (
                        <HighlightWord word={part.text} isExcerpt={isExcerpt} />
                    ) : (
                        part.text
                    )}
                </React.Fragment>
            ))}
        </>
    );
}

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

function Loading() {
    const {indexComplete, searchValue} = useContext(AppContext);
    
    if (!indexComplete && searchValue) {
        return <CircleAnimated className='shrink-0' />;
    }
    return null;
}

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

function SearchBox() {
    const {searchValue, dispatch, inputRef, t} = useContext(AppContext);
    const containerRef = useRef(null);
    
    useEscapeKeyHandler(inputRef, dispatch);

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
                    if (e.key === ARROW_UP || e.key === ARROW_DOWN) {
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

function AuthorAvatar({name, avatar}) {
    if (avatar?.length) {
        return (
            <img 
                className='rounded-full bg-neutral-300 w-7 h-7 me-2 object-cover' 
                src={avatar} 
                alt={name}
            />
        );
    }
    
    return (
        <div className='rounded-full bg-neutral-200 w-7 h-7 me-2 flex items-center justify-center font-bold'>
            <span className='text-neutral-400'>{name.charAt(0)}</span>
        </div>
    );
}

function ResultListItem({item, selectedResult, setSelectedResult, type}) {
    const {searchValue} = useContext(AppContext);
    const {id, url, name, title, excerpt, profile_image: profileImage} = item;
    
    const isSelected = id === selectedResult;
    const baseClassName = 'py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer';
    const className = isSelected ? `${baseClassName} bg-neutral-100` : baseClassName;

    const handleClick = () => {
        if (url) window.location.href = url;
    };

    const handleMouseEnter = () => setSelectedResult(id);

    if (type === 'author') {
        return (
            <div
                className={`${className} flex items-center py-[1rem]`}
                onClick={handleClick}
                onMouseEnter={handleMouseEnter}
            >
                <AuthorAvatar name={name} avatar={profileImage} />
                <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>
                    {name}
                </h2>
            </div>
        );
    }

    if (type === 'tag') {
        return (
            <div
                className={`${className} flex items-center`}
                onClick={handleClick}
                onMouseEnter={handleMouseEnter}
            >
                <p className='me-2 text-sm font-bold text-neutral-400'>#</p>
                <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>
                    {name}
                </h2>
            </div>
        );
    }

    // Post type
    return (
        <div
            className={className}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
        >
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-800'>
                <HighlightedSection text={title} highlight={searchValue} isExcerpt={false} />
            </h2>
            <p className='text-neutral-400 leading-normal text-sm mt-0 mb-0 truncate'>
                <HighlightedSection text={excerpt} highlight={searchValue} isExcerpt={true} />
            </p>
        </div>
    );
}

function ResultSection({title, items, selectedResult, setSelectedResult, type}) {
    const {t} = useContext(AppContext);

    if (!items?.length) {
        return null;
    }

    return (
        <div className='border-t border-gray-200 py-3 px-4 sm:px-7'>
            <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>
                {t(title)}
            </h1>
            {items.map((item) => (
                <ResultListItem
                    key={item.id}
                    item={item}
                    selectedResult={selectedResult}
                    setSelectedResult={setSelectedResult}
                    type={type}
                />
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
            onClick={() => setMaxPosts(maxPosts + STEP_MAX_POSTS)}
        >
            {t('Show more results')}
        </button>
    );
}

function PostResults({posts, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);
    const [maxPosts, setMaxPosts] = useState(DEFAULT_MAX_POSTS);
    const [paginatedPosts, setPaginatedPosts] = useState([]);

    useEffect(() => {
        setMaxPosts(DEFAULT_MAX_POSTS);
    }, [posts]);

    useEffect(() => {
        setPaginatedPosts(posts?.slice(0, maxPosts + 1) || []);
    }, [maxPosts, posts]);

    if (!posts?.length) {
        return null;
    }

    return (
        <div className='border-t border-neutral-200 py-3 px-4 sm:px-7'>
            <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>
                {t('Posts')}
            </h1>
            {paginatedPosts.map(post => (
                <ResultListItem
                    key={post.id}
                    item={post}
                    selectedResult={selectedResult}
                    setSelectedResult={setSelectedResult}
                    type='post'
                />
            ))}
            <ShowMoreButton setMaxPosts={setMaxPosts} maxPosts={maxPosts} posts={posts} />
        </div>
    );
}

function NoResultsBox() {
    const {t} = useContext(AppContext);
    return (
        <div className='py-4 px-7'>
            <p className='text-[1.65rem] text-neutral-400 leading-normal'>
                {t('No matches found')}
            </p>
        </div>
    );
}

function Results({posts, authors, tags}) {
    const {searchValue} = useContext(AppContext);
    const containerRef = useRef(null);

    const allResults = useMemo(() => [
        ...authors,
        ...tags,
        ...posts
    ], [authors, tags, posts]);

    const [selectedResult,