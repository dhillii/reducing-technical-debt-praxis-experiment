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
const EXCERPT_MIN_LENGTH = 50;

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
const filterInvalidUrls = (items) => items.filter(item => !(item?.url && INVALID_URL_REGEX.test(item?.url)));

const buildHighlightRegex = (highlight) => {
    const parts = highlight?.split(' ').map((term, idx) => {
        const escaped = String(term).replace(/\W/g, '\\$&');
        return idx > 0 ? `|^${escaped}|\\s${escaped}` : `^${escaped}|\\s${escaped}`;
    }).join('');
    return new RegExp(parts, 'ig');
};

const getMatchIndexes = ({text, highlight}) => {
    if (!highlight || !text) return [];
    const matchRegex = buildHighlightRegex(highlight);
    const matches = text.matchAll(matchRegex);
    return Array.from(matches).map(match => ({
        startIdx: match.index,
        endIdx: match.index + match[0].length
    }));
};

const getHighlightParts = ({text, highlight}) => {
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

    if (lastIdx < text.length) {
        parts.push({text: text.slice(lastIdx), type: 'normal'});
    }

    return {parts, highlightIndexes};
};

const handleKeyboardNavigation = (event, allResults, selectedResult, setSelectedResult) => {
    const selectedIdx = allResults.findIndex(d => d.id === selectedResult);
    
    if (event.key === 'ArrowUp' && selectedIdx > 0) {
        setSelectedResult(allResults[selectedIdx - 1].id);
    } else if (event.key === 'ArrowDown' && selectedIdx < allResults.length - 1) {
        setSelectedResult(allResults[selectedIdx + 1].id);
    } else if (event.key === 'Enter') {
        const selectedItem = allResults.find(d => d.id === selectedResult);
        if (selectedItem?.url) {
            window.location.href = selectedItem.url;
        }
    }
};

const useKeyboardListener = (containerRef, handler, dependencies) => {
    useEffect(() => {
        const node = containerRef?.current;
        if (!node) return;

        node.ownerDocument.addEventListener('keyup', handler);
        return () => node.ownerDocument.removeEventListener('keyup', handler);
    }, dependencies);
};

// Components
function PopupContent() {
    return <Search />;
}

function SearchBox() {
    const {searchValue, dispatch, inputRef, t} = useContext(AppContext);
    const containerRef = useRef(null);

    useEffect(() => {
        const timer = setTimeout(() => inputRef?.current?.focus(), 150);
        return () => clearTimeout(timer);
    }, [inputRef]);

    const handleEscapeKey = (event) => {
        if (event.key === 'Escape') {
            dispatch('update', {showPopup: false});
        }
    };

    useKeyboardListener(containerRef, handleEscapeKey, [dispatch]);

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
                    if (['ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
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
    return indexComplete && searchValue ? <CircleAnimated className='shrink-0' /> : null;
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

function ResultListItem({item, selectedResult, setSelectedResult, renderContent}) {
    const isSelected = item.id === selectedResult;
    const className = `py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer${isSelected ? ' bg-neutral-100' : ''}`;

    return (
        <div
            className={className}
            onClick={() => item.url && (window.location.href = item.url)}
            onMouseEnter={() => setSelectedResult(item.id)}
        >
            {renderContent(item)}
        </div>
    );
}

function TagListItem({tag, selectedResult, setSelectedResult}) {
    return (
        <ResultListItem
            item={tag}
            selectedResult={selectedResult}
            setSelectedResult={setSelectedResult}
            renderContent={({name}) => (
                <>
                    <p className='me-2 text-sm font-bold text-neutral-400'>#</p>
                    <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{name}</h2>
                </>
            )}
        />
    );
}

function TagResults({tags, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);

    if (!tags?.length) return null;

    return (
        <div className='border-t border-gray-200 py-3 px-4 sm:px-7'>
            <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>{t('Tags')}</h1>
            {tags.map(tag => (
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

function HighlightedText({text = '', highlight = '', isExcerpt = false}) {
    let displayText = text;
    let {parts, highlightIndexes} = getHighlightParts({text, highlight});

    if (isExcerpt && highlightIndexes?.[0]) {
        const startIdx = highlightIndexes[0].startIdx;
        if (startIdx > EXCERPT_MIN_LENGTH) {
            displayText = '...' + text.slice(startIdx - EXCERPT_CONTEXT_LENGTH);
            ({parts} = getHighlightParts({text: displayText, highlight}));
        }
    }

    return (
        <>
            {parts.map((part, idx) =>
                part.type === 'highlight' ? (
                    <span key={idx} className={`font-bold${!isExcerpt ? ' text-neutral-900' : ''}`}>
                        {part.text}
                    </span>
                ) : (
                    <span key={idx}>{part.text}</span>
                )
            )}
        </>
    );
}

function PostListItem({post, selectedResult, setSelectedResult}) {
    const {searchValue} = useContext(AppContext);
    const {title, excerpt, url, id} = post;

    return (
        <ResultListItem
            item={post}
            selectedResult={selectedResult}
            setSelectedResult={setSelectedResult}
            renderContent={() => (
                <>
                    <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-800'>
                        <HighlightedText text={title} highlight={searchValue} isExcerpt={false} />
                    </h2>
                    <p className='text-neutral-400 leading-normal text-sm mt-0 mb-0 truncate'>
                        <HighlightedText text={excerpt} highlight={searchValue} isExcerpt={true} />
                    </p>
                </>
            )}
        />
    );
}

function ShowMoreButton({posts, maxPosts, setMaxPosts}) {
    const {t} = useContext(AppContext);

    if (!posts?.length || maxPosts >= posts.length) return null;

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

    useEffect(() => {
        setMaxPosts(DEFAULT_MAX_POSTS);
    }, [posts]);

    if (!posts?.length) return null;

    const paginatedPosts = posts.slice(0, maxPosts + 1);

    return (
        <div className='border-t border-neutral-200 py-3 px-4 sm:px-7'>
            <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>{t('Posts')}</h1>
            {paginatedPosts.map(post => (
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
            <img className='rounded-full bg-neutral-300 w-7 h-7 me-2 object-cover' src={avatar} alt={name} />
        );
    }
    return (
        <div className='rounded-full bg-neutral-200 w-7 h-7 me-2 flex items-center justify-center font-bold'>
            <span className='text-neutral-400'>{name.charAt(0)}</span>
        </div>
    );
}

function AuthorListItem({author, selectedResult, setSelectedResult}) {
    const {name, profile_image: profileImage, id} = author;

    return (
        <ResultListItem
            item={author}
            selectedResult={selectedResult}
            setSelectedResult={setSelectedResult}
            renderContent={() => (
                <>
                    <AuthorAvatar name={name} avatar={profileImage} />
                    <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{name}</h2>
                </>
            )}
        />
    );
}

function AuthorResults({authors, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);

    if (!authors?.length) return null;

    return (
        <div className='border-t border-neutral-200 py-3 px-4 sm:px-7'>
            <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>{t('Authors')}</h1>
            {authors.map(author => (
                <AuthorListItem
                    key={author.name}
                    author={author}
                    selectedResult={selectedResult}
                    setSelectedResult={setSelectedResult}
                />
            ))}
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

function SearchResultBox() {
    const {searchValue = '', searchIndex, indexComplete} = useContext(AppContext);

    if (!indexComplete || !searchValue) {
        return searchValue ? <NoResultsBox /> : null;
    }

    const searchResults = searchIndex?.search(searchValue) || {};
    const filteredPosts = filterInvalidUrls(searchResults.posts || []);
    const filteredAuthors = filterInvalidUrls(searchResults.authors || []);
    const filteredTags = filterInvalidUrls(searchResults.tags || []);

    const hasResults = filteredPosts.length || filteredAuthors.length || filteredTags.length;

    return hasResults ? (
        <Results posts={filteredPosts} authors={filteredAuthors} tags={filteredTags} />
    ) : (
        <NoResultsBox />
    );
}

function Results({posts, authors, tags}) {
    const {searchValue} = useContext(AppContext);
    const containerRef = useRef(null);

    const allResults = useMemo(() => [...authors, ...tags, ...posts], [authors, tags, posts]);
    const [selectedResult, setSelectedResult] = useState(allResults[0]?.id || null);

    use