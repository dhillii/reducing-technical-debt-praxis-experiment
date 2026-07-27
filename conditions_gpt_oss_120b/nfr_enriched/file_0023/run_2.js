import AppContext from '../app-context';
import Frame from './frame';
import React, {useContext, useEffect, useMemo, useRef, useState} from 'react';
import {ReactComponent as CircleAnimated} from '../icons/circle-anim.svg';
import {ReactComponent as ClearIcon} from '../icons/clear.svg';
import {ReactComponent as SearchIcon} from '../icons/search.svg';

const DEFAULT_MAX_POSTS = 10;
const STEP_MAX_POSTS = 10;

const StylesWrapper = () => ({
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
});

class PopupContent extends React.Component {
    static contextType = AppContext;

    componentDidMount() {
        // No height change event needed
    }

    componentDidUpdate() {
        // No height change event needed
    }

    handlePopupClose(e) {
        e.preventDefault();
        if (e.target === e.currentTarget) {
            this.context.dispatch('update', {showPopup: false});
        }
    }

    render() {
        return <Search />;
    }
}

function SearchBox() {
    const {searchValue, dispatch, inputRef, t} = useContext(AppContext);
    const containerRef = useRef(null);

    useEffect(() => {
        const focusTimer = setTimeout(() => {
            inputRef?.current?.focus();
        }, 150);

        const keyUphandler = (event) => {
            if (event.key === 'Escape') {
                dispatch('update', {showPopup: false});
            }
        };

        const containeRefNode = containerRef?.current;
        containeRefNode?.ownerDocument.addEventListener('keyup', keyUphandler);

        return () => {
            clearTimeout(focusTimer);
            containeRefNode?.ownerDocument.removeEventListener('keyup', keyUphandler);
        };
    }, [dispatch, inputRef]);

    const baseClass = 'z-10 relative flex items-center py-5 px-4 sm:px-7 bg-white rounded';
    const className = searchValue ? `${baseClass}-t-lg shadow` : `${baseClass}-lg`;

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
    return indexComplete || !searchValue ? null : <CircleAnimated className='shrink-0' />;
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

function TagListItem({tag, selectedResult, setSelectedResult}) {
    const {name, url, id} = tag;
    const isSelected = id === selectedResult;
    const className = `flex items-center py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer${isSelected ? ' bg-neutral-100' : ''}`;

    return (
        <div
            className={className}
            onClick={() => url && (window.location.href = url)}
            onMouseEnter={() => setSelectedResult(id)}
        >
            <p className='me-2 text-sm font-bold text-neutral-400'>#</p>
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{name}</h2>
        </div>
    );
}

function TagResults({tags, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);
    if (!tags?.length) return null;

    return (
        <div className='border-t border-gray-200 py-3 px-4 sm:px-7'>
            <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>{t('Tags')}</h1>
            {tags.map((d) => (
                <TagListItem key={d.name} tag={d} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
        </div>
    );
}

function PostListItem({post, selectedResult, setSelectedResult}) {
    const {searchValue} = useContext(AppContext);
    const {title, excerpt, url, id} = post;
    const isSelected = id === selectedResult;
    const className = `py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer${isSelected ? ' bg-neutral-100' : ''}`;

    return (
        <div
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
        </div>
    );
}

/** Extracted helper to build regex for highlight matching */
function buildHighlightRegex(highlight) {
    const parts = [];
    highlight?.split(' ').forEach((term, idx) => {
        const escaped = String(term).replace(/\W/g, '\\&');
        const prefix = idx === 0 ? '^' : '|^';
        parts.push(`${prefix}${escaped}|\\s${escaped}`);
    });
    return new RegExp(parts.join(''), 'ig');
}

/** Returns start/end indexes of highlight matches */
function getMatchIndexes({text, highlight}) {
    const regex = buildHighlightRegex(highlight);
    const matches = text?.matchAll(regex) || [];
    const indexes = [];
    for (const match of matches) {
        indexes.push({
            startIdx: match?.index,
            endIdx: (match?.index || 0) + (match?.[0].length || 0)
        });
    }
    return indexes;
}

/** Splits text into highlighted and normal parts */
function getHighlightParts({text, highlight}) {
    const highlightIndexes = getMatchIndexes({text, highlight});
    const parts = [];
    let lastIdx = 0;

    highlightIndexes.forEach(({startIdx, endIdx}) => {
        if (lastIdx < startIdx) {
            parts.push({text: text?.slice(lastIdx, startIdx), type: 'normal'});
        }
        parts.push({text: text?.slice(startIdx, endIdx), type: 'highlight'});
        lastIdx = endIdx;
    });

    if (lastIdx < text?.length) {
        parts.push({text: text?.slice(lastIdx), type: 'normal'});
    }

    return {parts, highlightIndexes};
}

function HighlightedSection({text = '', highlight = '', isExcerpt}) {
    const {parts, highlightIndexes} = getHighlightParts({text, highlight});

    // Trim long excerpts to show context around first highlight
    let displayParts = parts;
    if (isExcerpt && highlightIndexes?.[0]) {
        const startIdx = highlightIndexes[0].startIdx;
        if (startIdx > 50) {
            const trimmedText = '...' + text.slice(startIdx - 20);
            const {parts: trimmedParts} = getHighlightParts({text: trimmedText, highlight});
            displayParts = trimmedParts;
        }
    }

    return (
        <>
            {displayParts.map((segment, idx) =>
                segment.type === 'highlight' ? (
                    <React.Fragment key={idx}>
                        <HighlightWord word={segment.text} isExcerpt={isExcerpt} />
                    </React.Fragment>
                ) : (
                    <React.Fragment key={idx}>{segment.text}</React.Fragment>
                )
            )}
        </>
    );
}

function HighlightWord({word, isExcerpt}) {
    const className = isExcerpt ? 'font-bold' : 'font-bold text-neutral-900';
    return <span className={className}>{word}</span>;
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
    const [paginatedPosts, setPaginatedPosts] = useState([]);

    useEffect(() => setMaxPosts(DEFAULT_MAX_POSTS), [posts]);
    useEffect(() => setPaginatedPosts(posts?.slice(0, maxPosts + 1)), [maxPosts, posts]);

    if (!posts?.length) return null;

    return (
        <div className='border-t border-neutral-200 py-3 px-4 sm:px-7'>
            <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>{t('Posts')}</h1>
            {paginatedPosts.map((d) => (
                <PostListItem key={d.title} post={d} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
            <ShowMoreButton posts={posts} maxPosts={maxPosts} setMaxPosts={setMaxPosts} />
        </div>
    );
}

function AuthorListItem({author, selectedResult, setSelectedResult}) {
    const {name, profile_image: profileImage, url, id} = author;
    const isSelected = id === selectedResult;
    const className = `py-[1rem] -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer flex items-center${isSelected ? ' bg-neutral-100' : ''}`;

    return (
        <div
            className={className}
            onClick={() => url && (window.location.href = url)}
            onMouseEnter={() => setSelectedResult(id)}
        >
            <AuthorAvatar name={name} avatar={profileImage} />
            <h2 className='text-[1.65rem] font-medium leading-tight text-neutral-900 truncate'>{name}</h2>
        </div>
    );
}

function AuthorAvatar({name, avatar}) {
    const hasAvatar = !!avatar?.length;
    const initial = name?.charAt(0) ?? '';
    return hasAvatar ? (
        <img className='rounded-full bg-neutral-300 w-7 h-7 me-2 object-cover' src={avatar} alt={name} />
    ) : (
        <div className='rounded-full bg-neutral-200 w-7 h-7 me-2 flex items-center justify-center font-bold'>
            <span className='text-neutral-400'>{initial}</span>
        </div>
    );
}

function AuthorResults({authors, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);
    if (!authors?.length) return null;

    return (
        <div className='border-t border-neutral-200 py-3 px-4 sm:px-7'>
            <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>{t('Authors')}</h1>
            {authors.map((d) => (
                <AuthorListItem key={d.name} author={d} selectedResult={selectedResult} setSelectedResult={setSelectedResult} />
            ))}
        </div>
    );
}

function SearchResultBox() {
    const {searchValue = '', searchIndex, indexComplete} = useContext(AppContext);
    if (!indexComplete || !searchValue) return null;

    const results = searchIndex?.search(searchValue) || {};
    const filteredPosts = results.posts || [];
    const filteredAuthors = (results.authors || []).filter(
        (author) => !(author?.url && /\/404\/$/.test(author?.url))
    );
    const filteredTags = (results.tags || []).filter(
        (tag) => !(tag?.url && /\/404\/$/.test(tag?.url))
    );

    const hasResults = filteredPosts.length || filteredAuthors.length || filteredTags.length;

    return hasResults ? (
        <Results posts={filteredPosts} authors={filteredAuthors} tags={filteredTags} />
    ) : (
        <NoResultsBox />
    );
}

function Results({posts, authors, tags}) {
    const {searchValue} = useContext(AppContext);
    const allResults = useMemo(() => [...authors, ...tags, ...posts], [authors, tags, posts]);
    const defaultId = allResults?.[0]?.id || null;
    const [selectedResult, setSelectedResult] = useState(defaultId);
    const containerRef = useRef(null);

    useEffect(() => {
        setSelectedResult(allResults?.[0]?.id || null);
    }, [allResults]);

    useEffect(() => {
        const keyUphandler = (event) => {
            const currentIdx = allResults.findIndex((d) => d.id === selectedResult);
            const prev = allResults[currentIdx - 1];
            const next = allResults[currentIdx + 1];

            if (event.key === 'ArrowUp' && prev) setSelectedResult(prev.id);
            else if (event.key === 'ArrowDown' && next) setSelectedResult(next.id);
            else if (event.key === 'Enter') {
                const target = allResults.find((d) => d.id === selectedResult);
                if (target?.url) window.location.href = target.url;
            }
        };

        const node = containerRef?.current;
        node?.ownerDocument.addEventListener('keyup', keyUphandler);
        return () => node?.ownerDocument.removeEventListener('keyup', keyUphandler);
    }, [allResults, selectedResult]);

    if (!searchValue) return null;

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
            <p className='text-[1.65rem] text-neutral-400 leading-normal'>{t('No matches found')}</p>
        </div>
    );
}

function Search() {
    const {dispatch} = useContext(AppContext);
    return (
        <>
            <div
                className='h-screen w-screen pt-20 antialiased z-50 relative ghost-display'
                onClick={(e) => {
                    e.preventDefault();
                    if (e.target === e.currentTarget) {
                        dispatch('update', {showPopup: false});
                    }
                }}
            >
                <div className='bg-white w-full max-w-[95vw] sm:max-w-lg rounded-lg shadow-xl m-auto relative translate-z-0 animate-popup'>
                    <SearchBox />
                    <SearchResultBox />
                </div>
            </div>
        </>
    );
}

export default class PopupModal extends React.Component {
    static contextType = AppContext;

    constructor(props) {
        super(props);
        this.state = {height: null};
    }

    onHeightChange(height) {
        this.setState({height});
    }

    handlePopupClose(e) {
        e.preventDefault();
        if (e.target === e.currentTarget) {
            this.context.dispatch('update', {showPopup: false});
        }
    }

    renderFrameStyles() {
        const styles = `
            :root {
                --brandcolor: ${this.context.brandColor || ''}
            }

            .ghost-display {
                display: none;
            }
        `;

        const stylesUrl = this.context.stylesUrl;
        return (
            <>
                {stylesUrl && <link rel='stylesheet' href={stylesUrl} />}
                <style dangerouslySetInnerHTML={{__html: styles}} />
                <meta name='viewport' content='width=device-width, initial-scale=1, maximum-scale=1' />
            </>
        );
    }

    renderFrameContainer() {
        const Styles = StylesWrapper();
        const frameStyle = {...Styles.frame.common};

        return (
            <div style={Styles.modalContainer} className='gh-root-frame'>
                <Frame style={frameStyle} title='portal-popup' head={this.renderFrameStyles()} searchdir={this.context.dir}>
                    <div
                        onClick={this.handlePopupClose.bind(this)}
                        className='absolute top-0 bottom-0 left-0 right-0 block backdrop-blur-[2px] animate-fadein z-0 bg-gradient-to-br from-[rgba(0,0,0,0.2)] to-[rgba(0,0,0,0.1)]'
                    />
                    <PopupContent />
                </Frame>
            </div>
        );
    }

    render() {
        return this.context.showPopup ? this.renderFrameContainer() : null;
    }
}