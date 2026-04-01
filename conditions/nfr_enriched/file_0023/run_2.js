```javascript
import AppContext from '../app-context';
import Frame from './frame';
import React, {useContext, useEffect, useMemo, useRef, useState} from 'react';
import {ReactComponent as CircleAnimated} from '../icons/circle-anim.svg';
import {ReactComponent as ClearIcon} from '../icons/clear.svg';
import {ReactComponent as SearchIcon} from '../icons/search.svg';

const DEFAULT_MAX_POSTS = 10;
const STEP_MAX_POSTS = 10;

const StylesWrapper = () => {
    return {
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
            common: {
                margin: 'auto',
                position: 'relative',
                padding: '0',
                outline: '0',
                width: '100%',
                opacity: '1',
                overflow: 'hidden',
                height: '100%'
            }
        },
        page: {
            links: {
                width: '600px'
            }
        }
    };
};

class PopupContent extends React.Component {
    static contextType = AppContext;

    componentDidMount() {
        // Lifecycle hook for popup content initialization
    }

    componentDidUpdate() {
        // Lifecycle hook for popup content updates
    }

    handlePopupClose(e) {
        e.preventDefault();
        if (e.target === e.currentTarget) {
            this.context.dispatch('update', {
                showPopup: false
            });
        }
    }

    render() {
        return (
            <Search />
        );
    }
}

function SearchBox() {
    const {searchValue, dispatch, inputRef, t} = useContext(AppContext);
    const containerRef = useRef(null);
    useEffect(() => {
        setTimeout(() => {
            inputRef?.current?.focus();
        }, 150);

        let keyUphandler = (event) => {
            if (event.key === 'Escape') {
                dispatch('update', {
                    showPopup: false
                });
            }
        };
        const containeRefNode = containerRef?.current;
        containeRefNode?.ownerDocument.removeEventListener('keyup', keyUphandler);
        containeRefNode?.ownerDocument.addEventListener('keyup', keyUphandler);
        return () => {
            containeRefNode?.ownerDocument.removeEventListener('keyup', keyUphandler);
        };
    }, [dispatch, inputRef]);

    let className = 'z-10 relative flex items-center py-5 px-4 sm:px-7 bg-white rounded-t-lg shadow';
    if (!searchValue) {
        className = 'z-10 relative flex items-center py-5 px-4 sm:px-7 bg-white rounded-lg';
    }

    return (
        <div className={className} ref={containerRef}>
            <div className='flex items-center justify-center w-4 h-4 me-3'>
                <SearchClearIcon />
            </div>
            <input
                ref={inputRef}
                value={searchValue || ''}
                onChange={(e) => {
                    dispatch('update', {
                        searchValue: e.target.value
                    });
                }}
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

function SearchClearIcon() {
    const {searchValue = '', dispatch} = useContext(AppContext);
    if (!searchValue) {
        return (
            <SearchIcon className='text-neutral-900' alt='Search' />
        );
    }
    return (
        <button alt='Clear' className='-mb-[1px]' onClick={() => {
            dispatch('update', {
                searchValue: ''
            });
        }}>
            <ClearIcon className='text-neutral-900 hover:text-neutral-500 h-[1.1rem] w-[1.1rem]' />
        </button>
    );
}

function Loading() {
    const {indexComplete, searchValue} = useContext(AppContext);
    if (!indexComplete && searchValue) {
        return (
            <CircleAnimated className='shrink-0' />
        );
    }
    return null;
}

function CancelButton() {
    const {dispatch, t} = useContext(AppContext);

    return (
        <button
            className='ms-3 text-sm text-neutral-500 sm:hidden' alt='Cancel'
            onClick={() => {
                dispatch('update', {
                    showPopup: false
                });
            }}
        >
            {t('Cancel')}
        </button>
    );
}

function TagListItem({tag, selectedResult, setSelectedResult}) {
    const {name, url, id} = tag;
    let className = 'flex items-center py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer';
    if (id === selectedResult) {
        className += ' bg-neutral-100';
    }
    return (
        <div
            className={className}
            onClick={() => {
                if (url) {
                    window.location.href = url;
                }
            }}
            onMouseEnter={() => {
                setSelectedResult(id);
            }}
        >
            <p className='me-2 text-sm font-bold text-neutral-400'>#</p>
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{name}</h2>
        </div>
    );
}

function TagResults({tags, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);

    if (!tags?.length) {
        return null;
    }

    const TagItems = tags.map((d) => {
        return (
            <TagListItem
                key={d.name}
                tag={d}
                {...{selectedResult, setSelectedResult}}
            />
        );
    });
    return (
        <div className='border-t border-gray-200 py-3 px-4 sm:px-7'>
            <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>{t('Tags')}</h1>
            {TagItems}
        </div>
    );
}

function PostListItem({post, selectedResult, setSelectedResult}) {
    const {searchValue} = useContext(AppContext);
    const {title, excerpt, url, id} = post;
    let className = 'py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer';
    if (id === selectedResult) {
        className += ' bg-neutral-100';
    }
    return (
        <div
            className={className}
            onClick={() => {
                if (url) {
                    window.location.href = url;
                }
            }}
            onMouseEnter={() => {
                setSelectedResult(id);
            }}
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

// Builds regex pattern from space-separated search terms with proper escaping
function buildHighlightRegexPattern(highlight) {
    let highlightRegexText = '';
    highlight?.split(' ').forEach((d, idx) => {
        const e = String(d).replace(/\W/g, '\\&');
        if (idx > 0) {
            highlightRegexText += `|^` + e + `|\\s` + e;
        } else {
            highlightRegexText = `^` + e + `|\\s` + e;
        }
    });
    return highlightRegexText;
}

function getMatchIndexes({text, highlight}) {
    const highlightRegexText = buildHighlightRegexPattern(highlight);
    const matchRegex = new RegExp(`${highlightRegexText}`, 'ig');
    let matches = text?.matchAll(matchRegex);
    const indexes = [];
    for (const match of matches) {
        indexes.push({
            startIdx: match?.index,
            endIdx: (match?.index || 0) + (match?.[0].length || 0)
        });
    }
    return indexes;
}

// Segments text into highlighted and normal parts based on search matches
function getHighlightParts({text, highlight}) {
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
    return {
        parts,
        highlightIndexes
    };
}

// Truncates excerpt to show context around first match
function truncateExcerptAroundMatch(text, highlight) {
    const {highlightIndexes} = getHighlightParts({text, highlight});
    if (!highlightIndexes?.[0]) {
        return text;
    }
    const startIdx = highlightIndexes[0].startIdx;
    if (startIdx > 50) {
        return '...' + text?.slice(startIdx - 20);
    }
    return text;
}

function HighlightedSection({text = '', highlight = '', isExcerpt}) {
    text = text || '';
    highlight = highlight || '';
    
    let displayText = text;
    if (isExcerpt) {
        displayText = truncateExcerptAroundMatch(text, highlight);
    }
    
    let {parts} = getHighlightParts({text: displayText, highlight});

    const wordMap = parts.map((d, idx) => {
        if (d?.type === 'highlight') {
            return (
                <React.Fragment key={idx}>
                    <HighlightWord word={d.text} isExcerpt={isExcerpt}/>
                </React.Fragment>
            );
        } else {
            return (
                <React.Fragment key={idx}>
                    {d.text}
                </React.Fragment>
            );
        }
    });
    return (
        <>
            {wordMap}
        </>
    );
}

function HighlightWord({word, isExcerpt}) {
    if (isExcerpt) {
        return (
            <>
                <span className='font-bold'>{word}</span>
            </>
        );
    }
    return (
        <>
            <span className='font-bold text-neutral-900'>{word}</span>
        </>
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
            onClick={() => {
                const updatedMaxPosts = maxPosts + STEP_MAX_POSTS;
                setMaxPosts(updatedMaxPosts);
            }}
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
    function PostItems() {
        return paginatedPosts.map(d => (
            <PostListItem
                key={d.title}
                post={d}
                {...{selectedResult, setSelectedResult}}
            />
        ));
    }
    return (
        <div className='border-t border-neutral-200 py-3 px-4 sm:px-7'>
            <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>{t('Posts')}</h1>
            <PostItems/>
            <ShowMoreButton setMaxPosts={setMaxPosts} maxPosts={maxPosts} posts={posts} />
        </div>
    );
}

function AuthorListItem({author, selectedResult, setSelectedResult}) {
    const {name, profile_image: profileImage, url, id} = author;
    let className = 'py-[1rem] -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer flex items-center';
    if (id === selectedResult) {
        className += ' bg-neutral-100';
    }
    return (
        <div
            className={className}
            onClick={() => {
                if (url) {
                    window.location.href = url;
                }
            }}
            onMouseEnter={() => {
                setSelectedResult(id);
            }}
        >
            <AuthorAvatar name={name} avatar={profileImage} />
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{name}</h2>
        </div>
    );
}

function AuthorAvatar({name, avatar}) {
    const Avatar = avatar?.length;
    const Character = name.charAt(0);
    if (Avatar) {
        return (
            <img className='rounded-full bg-neutral-300 w-7 h-7 me-2 object-cover' src={avatar} alt={name}/>
        );
    }
    return (
        <div className='rounded-full bg-neutral-200 w-7 h-7 me-2 flex items-center justify-center font-bold'><span className="text-neutral-400">{Character}</span></div>
    );
}

function AuthorResults({authors, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);

    if (!authors?.length) {
        return null;
    }

    const AuthorItems = authors.map((d) => {
        return (
            <Author