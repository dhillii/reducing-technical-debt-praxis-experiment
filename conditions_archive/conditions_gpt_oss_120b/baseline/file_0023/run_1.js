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
        const focusTimeout = setTimeout(() => {
            inputRef?.current?.focus();
        }, 150);

        const keyUphandler = event => {
            if (event.key === 'Escape') {
                dispatch('update', {showPopup: false});
            }
        };

        const containeRefNode = containerRef?.current;
        containeRefNode?.ownerDocument.addEventListener('keyup', keyUphandler);

        return () => {
            clearTimeout(focusTimeout);
            containeRefNode?.ownerDocument.removeEventListener('keyup', keyUphandler);
        };
    }, [dispatch, inputRef]);

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

function SearchClearIcon() {
    const {searchValue = '', dispatch} = useContext(AppContext);
    return !searchValue ? (
        <SearchIcon className='text-neutral-900' alt='Search' />
    ) : (
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
    return !indexComplete && searchValue ? <CircleAnimated className='shrink-0' /> : null;
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
    const className = `flex items-center py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer${
        id === selectedResult ? ' bg-neutral-100' : ''
    }`;

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
            {tags.map(d => (
                <TagListItem
                    key={d.name}
                    tag={d}
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
    const className = `py-3 -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer${
        id === selectedResult ? ' bg-neutral-100' : ''
    }`;

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

function getMatchIndexes({text, highlight}) {
    let highlightRegexText = '';
    highlight?.split(' ').forEach((d, idx) => {
        const e = String(d).replace(/\W/g, '\\&');
        highlightRegexText += idx > 0 ? `|^${e}|\\s${e}` : `^${e}|\\s${e}`;
    });
    const matchRegex = new RegExp(`${highlightRegexText}`, 'ig');
    const matches = text?.matchAll(matchRegex) ?? [];
    const indexes = [];
    for (const match of matches) {
        indexes.push({
            startIdx: match?.index,
            endIdx: (match?.index || 0) + (match?.[0].length || 0)
        });
    }
    return indexes;
}

function getHighlightParts({text, highlight}) {
    const highlightIndexes = getMatchIndexes({text, highlight});
    const parts = [];
    let lastIdx = 0;

    highlightIndexes.forEach(({startIdx, endIdx}) => {
        if (lastIdx !== startIdx) {
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
    let {parts, highlightIndexes} = getHighlightParts({text, highlight});

    if (isExcerpt && highlightIndexes?.[0]) {
        const startIdx = highlightIndexes[0].startIdx;
        if (startIdx > 50) {
            text = '...' + text?.slice(startIdx - 20);
            ({parts} = getHighlightParts({text, highlight}));
        }
    }

    return (
        <>
            {parts.map((d, idx) =>
                d.type === 'highlight' ? (
                    <React.Fragment key={idx}>
                        <HighlightWord word={d.text} isExcerpt={isExcerpt} />
                    </React.Fragment>
                ) : (
                    <React.Fragment key={idx}>{d.text}</React.Fragment>
                )
            )}
        </>
    );
}

function HighlightWord({word, isExcerpt}) {
    return (
        <span className={isExcerpt ? 'font-bold' : 'font-bold text-neutral-900'}>{word}</span>
    );
}

function ShowMoreButton({posts, maxPosts, setMaxPosts}) {
    const {t} = useContext(AppContext);
    if (!posts?.length || maxPosts >= posts?.length) return null;

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
            {paginatedPosts.map(d => (
                <PostListItem
                    key={d.title}
                    post={d}
                    selectedResult={selectedResult}
                    setSelectedResult={setSelectedResult}
                />
            ))}
            <ShowMoreButton posts={posts} maxPosts={maxPosts} setMaxPosts={setMaxPosts} />
        </div>
    );
}

function AuthorListItem({author, selectedResult, setSelectedResult}) {
    const {name, profile_image: profileImage, url, id} = author;
    const className = `py-[1rem] -mx-4 sm:-mx-7 px-4 sm:px-7 cursor-pointer flex items-center${
        id === selectedResult ? ' bg-neutral-100' : ''
    }`;

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
    return avatar?.length ? (
        <img className='rounded-full bg-neutral-300 w-7 h-7 me-2 object-cover' src={avatar} alt={name} />
    ) : (
        <div className='rounded-full bg-neutral-200 w-7 h-7 me-2 flex items-center justify-center font-bold'>
            <span className='text-neutral-400'>{name.charAt(0)}</span>
        </div>
    );
}

function AuthorResults({authors, selectedResult, setSelectedResult}) {
    const {t} = useContext(AppContext);
    if (!authors?.length) return null;

    return (
        <div className='border-t border-neutral-200 py-3 px-4 sm:px-7'>
            <h1 className='uppercase text-xs text-neutral-400 font-semibold mb-1 tracking-wide'>{t('Authors')}</h1>
            {authors.map(d => (
                <AuthorListItem
                    key={d.name}
                    author={d}
                    selectedResult={selectedResult}
                    setSelectedResult={setSelectedResult}
                />
            ))}
        </div>
    );
}

function SearchResultBox() {
    const {searchValue = '', searchIndex, indexComplete} = useContext(AppContext);
    let filteredTags = [];
    let filteredPosts = [];
    let filteredAuthors = [];

    if (indexComplete && searchValue) {
        const searchResults = searchIndex?.search(searchValue);
        filteredPosts = searchResults?.posts || [];
        filteredAuthors = searchResults?.authors || [];
        filteredTags = searchResults?.tags || [];
    }

    const invalidUrlRegex = /\/404\/$/;
    filteredAuthors = filteredAuthors.filter(author => !(author?.url && invalidUrlRegex.test(author?.url)));
    filteredTags = filteredTags.filter(tag => !(tag?.url && invalidUrlRegex.test(tag?.url)));

    const hasResults = filteredPosts?.length || filteredAuthors?.length || filteredTags?.length;

    if (hasResults) {
        return <Results posts={filteredPosts} authors={filteredAuthors} tags={filteredTags} />;
    }
    if (searchValue) {
        return <NoResultsBox />;
    }
    return null;
}

function Results({posts, authors, tags}) {
    const {searchValue} = useContext(AppContext);
    const allResults = useMemo(() => [...authors, ...tags, ...posts], [authors, tags, posts]);
    const defaultId = allResults?.[0]?.id || null;
    const [selectedResult, setSelectedResult] = useState(defaultId);
    const containerRef = useRef(null);

    useEffect(() => setSelectedResult(allResults?.[0]?.id || null), [allResults]);

    useEffect(() => {
        const keyUphandler = event => {
            const currentIdx = allResults.findIndex(d => d.id === selectedResult);
            const next = allResults[currentIdx + 1];
            const prev = allResults[currentIdx - 1];

            if (event.key === 'ArrowUp' && prev) setSelectedResult(prev.id);
            else if (event.key === 'ArrowDown' && next) setSelectedResult(next.id);
            else if (event.key === 'Enter') {
                const selected = allResults.find(d => d.id === selectedResult);
                selected?.url && (window.location.href = selected.url);
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
        <div
            className='h-screen w-screen pt-20 antialiased z-50 relative ghost-display'
            onClick={e => {
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
                <Frame
                    style={frameStyle}
                    title='portal-popup'
                    head={this.renderFrameStyles()}
                    searchdir={this.context.dir}
                >
                    <div
                        onClick={e => this.handlePopupClose(e)}
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