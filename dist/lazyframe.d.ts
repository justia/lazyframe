import './scss/lazyframe.scss';
type Vendor = 'youtube' | 'youtube_nocookie' | 'vimeo';
interface LazyframeOptions {
    vendor?: Vendor;
    id?: string;
    src?: string;
    thumbnail?: string;
    title?: string;
    lazyload?: boolean;
    autoplay?: boolean;
    initinview?: boolean;
    loadThumbnail?: boolean;
    showPlayButton?: boolean;
    onLoad?: (instance: LazyframeInstance) => void;
    onAppend?: (iframe: HTMLIFrameElement) => void;
    onThumbnailLoad?: (imgUrl: string) => void;
}
interface LazyframeSettings extends LazyframeOptions {
    initialized: boolean;
    originalSrc?: string;
    query?: string | null;
}
interface LazyframeInstance {
    el: HTMLElement;
    settings: LazyframeSettings;
    iframe?: HTMLIFrameElement;
}
declare const lazyframe: (selector: string | HTMLElement | NodeListOf<HTMLElement>, userOptions?: LazyframeOptions) => void;
export default lazyframe;
