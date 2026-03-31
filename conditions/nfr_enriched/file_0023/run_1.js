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
const EXCERPT_MIN_START = 50;
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

const navigateTo = (url) => {
    if (url) {
        window.location.href = url;
    }
};

const closePopup = (dispatch) => {
    dispatch('update', {showPopup: false});
};

const updateSearchValue = (dispatch, value) => {
    dispatch('update', {searchValue: value});
};

const escapeRegexSpecialChars = (str) => String(str).replace(/\W/g, '\\&');

const buildHighlightRegex = (highlight) => {
    if (!highlight) return null;
    
    let regexText = '';
    highlight.split(' ').forEach((word, idx) => {
        const escaped = escapeRegexSpecialChars(word);
        const pattern = `^${escaped}|\\s${escaped}`;
        regexText += idx > 0 ? `|${pattern}` : pattern;
    });
    
    return new RegExp(regexText, 'ig');
};

const getMatchIndexes = ({text, highlight}) => {
    const matchRegex = buildHighlightRegex(highlight);
    if (!matchRegex) return [];
    
    const matches = text?.matchAll(matchRegex) || [];
    const indexes = [];
    
    for (const match of matches) {
        indexes.push({
            startIdx: match?.index,
            endIdx: (match?.index || 0) + (match?.[0].length || 0)
        });
    }
    
    return indexes;
};

const getHighlightParts = ({text, highlight}) => {
    const highlightIndexes = getMatchIndexes({text, highlight});
    const parts = [];
    let lastIdx = 0;

    highlightIndexes.forEach((highlightIdx) => {
        if (lastIdx === highlightIdx.startIdx) {
            parts.push({
                text: text?.slice(highlightIdx.startIdx, highlightIdx.endIdx),
                type: 'highlight'
            });
            lastIdx = highlightIdx.endIdx;
        } else {
            parts.push({
                text: text?.slice(lastIdx, highlightIdx.startIdx),
                type: 'normal'
            });
            parts.push({
                text: text?.slice(highlightIdx.startIdx, highlightIdx.endIdx),
                type: 'highlight'
            });
            lastIdx = highlightIdx.endIdx;
        }
    });
    
    if (lastIdx < text?.length) {
        parts.push({
            text: text?.slice(lastIdx, text.length),
            type: 'normal'
        });
    }
    
    return {parts, highlightIndexes};
};

const filterInvalidResults = (results) => results.filter(isValidUrl);

const useKeyboardNavigation = (containerRef, allResults, selectedResult, setSelectedResult) => {
    useEffect(() => {
        const handleKeyUp = (event) => {
            const selectedIdx = allResults.findIndex((d) => d.id === selectedResult);
            const nextResult = allResults[selectedIdx + 1];
            const prevResult = allResults[selectedIdx - 1];

            if (event.key === ARROW_UP && prevResult) {
                setSelectedResult(prevResult?.id);
            } else if (event.key === ARROW_DOWN && nextResult) {
                setSelectedResult(nextResult?.id);
            } else if (event.key === ENTER) {
                const selectedData = allResults.find((d) => d.id === selectedResult);
                navigateTo(selectedData?.url);
            }
        };

        const node = containerRef?.current;
        node?.ownerDocument?.addEventListener('keyup', handleKeyUp);

        return () => {
            node?.ownerDocument?.removeEventListener('keyup', handleKeyUp);
        };
    }, [allResults, selectedResult, setSelectedResult, containerRef]);
};

const useEscapeKeyHandler = (dispatch) => {
    useEffect(() => {
        const handleKeyUp = (event) => {
            if (event.key === ESCAPE) {
                closePopup(dispatch);
            }
        };

        document.addEventListener('keyup', handleKeyUp);
        return () => {
            document.removeEventListener('keyup', handleKeyUp);
        };
    }, [dispatch]);
};

const useInputFocus = (inputRef) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            inputRef?.current?.focus();
        }, 150);

        return () => clearTimeout(timer);
    }, [inputRef]);
};

// Components
function SearchClearIcon() {
    const {searchValue = '', dispatch} = useContext(AppContext);
    
    if (!searchValue) {
        return <SearchIcon className='text-neutral-900' alt='Search' />;
    }
    
    return (
        <button 
            alt='Clear' 
            className='-mb-[1px]' 
            onClick={() => updateSearchValue(dispatch, '')}
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
            onClick={() => closePopup(dispatch)}
        >
            {t('Cancel')}
        </button>
    );
}

function SearchBox() {
    const {searchValue, dispatch, inputRef, t} = useContext(AppContext);
    const containerRef = useRef(null);

    useInputFocus(inputRef);
    useEscapeKeyHandler(dispatch);

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
                onChange={(e) => updateSearchValue(dispatch, e.target.value)}
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

function HighlightWord({word, isExcerpt}) {
    const className = isExcerpt ? 'font-bold' : 'font-bold text-neutral-900';
    return <span className={className}>{word}</span>;
}

function HighlightedSection({text = '', highlight = '', isExcerpt}) {
    let {parts, highlightIndexes} = getHighlightParts({text, highlight});

    if (isExcerpt && highlightIndexes?.[0]) {
        const startIdx = highlightIndexes[0].startIdx;
        if (startIdx > EXCERPT_MIN_START) {
            const truncatedText = '...' + text?.slice(startIdx - EXCERPT_CONTEXT_LENGTH);
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

function TagListItem({tag, selectedResult, setSelectedResult}) {
    const {name, url, id} = tag;
    const isSelected = id === selectedResult;
    const className = `flex items-center py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer ${
        isSelected ? 'bg-neutral-100' : ''
    }`;

    return (
        <div
            className={className}
            onClick={() => navigateTo(url)}
            onMouseEnter={() => setSelectedResult(id)}
        >
            <p className='me-2 text-sm font-bold text-neutral-400'>#</p>
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>
                {name}
            </h2>
        </div>
    );
}

function TagResults({tags, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);

    if (!tags?.length) {
        return null;
    }

    return (
        <div className='border-t border-gray-200 py-3 px-4 sm:px-7'>
            <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>
                {t('Tags')}
            </h1>
            {tags.map((tag) => (
                <TagListItem
                    key={tag.name}
                    tag={tag}
                    selectedResult={selectedResult}
                    setSelectedResult={setSelectedResult}
                />
            ))}
        </div>
    );
}

function PostListItem({post, selectedResult, setSelectedResult}) {
    const {searchValue} = useContext(AppContext);
    const {title, excerpt, url, id} = post;
    const isSelected = id === selectedResult;
    const className = `py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer ${
        isSelected ? 'bg-neutral-100' : ''
    }`;

    return (
        <div
            className={className}
            onClick={() => navigateTo(url)}
            onMouseEnter={() => setSelectedResult(id)}
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

function ShowMoreButton({posts, maxPosts, setMaxPosts}) {
    const {t} = useContext(AppContext);

    if (!posts?.length || maxPosts >= posts?.length) {
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
        setPaginatedPosts(posts?.slice(0, maxPosts + 1));
    }, [maxPosts, posts]);

    if (!posts?.length) {
        return null;
    }

    return (
        <div className='border-t border-neutral-200 py-3 px-4 sm:px-7'>
            <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>
                {t('Posts')}
            </h1>
            {paginatedPosts.map((post) => (
                <PostListItem
                    key={post.title}
                    post={post}
                    selectedResult={selectedResult}
                    setSelectedResult={setSelectedResult}
                />
            ))}
            <ShowMoreButton setMaxPosts={setMaxPosts} maxPosts={maxPosts} posts={posts} />
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

function AuthorListItem({author, selectedResult, setSelectedResult}) {
    const {name, profile_image: profileImage, url, id} = author;
    const isSelected = id === selectedResult;
    const className = `py-[1rem] -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer flex items-center ${
        isSelected ? 'bg-neutral-100' : ''
    }`;

    return (
        <div
            className={className}
            onClick={() => navigateTo(url)}
            onMouseEnter={() => setSelectedResult(id)}
        >
            <AuthorAvatar name={name} avatar={profileImage} />
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>
                {name}
            </h2>