import './scss/lazyframe.scss';
type Vendor = 'youtube' | 'youtube_nocookie' | 'vimeo';
type AspectRatio = '16:9' | '4:3' | '1:1';
type StringBoolean = 'true' | 'false';
type ConvertStringBool<T> = T extends StringBoolean ? boolean : T;
export type LazyframeOptions = {
    lazyload?: boolean;
    autoplay?: boolean;
    initinview?: boolean;
    loadThumbnail?: boolean;
    showPlayButton?: boolean;
    onLoad?: (instance: LazyframeInstance) => void;
    onAppend?: (iframe: HTMLIFrameElement) => void;
    onThumbnailLoad?: (imgUrl: string) => void;
};
export type LazyframeDatasetStringOptions = {
    src: string;
    vendor?: Vendor;
    title?: string;
    thumbnail?: string;
    ratio?: AspectRatio;
    lazyload?: StringBoolean;
    autoplay?: StringBoolean;
    initinview?: StringBoolean;
    loadThumbnail?: StringBoolean;
    showPlayButton?: StringBoolean;
};
type LazyframeDatasetOptions = {
    [K in keyof LazyframeDatasetStringOptions]: ConvertStringBool<LazyframeDatasetStringOptions[K]>;
};
export interface HTMLLazyframeElement extends HTMLElement {
    dataset: LazyframeDatasetStringOptions;
}
type LazyframeSettings = LazyframeOptions & Omit<LazyframeDatasetOptions, 'thumbnail'> & {
    initialized: boolean;
    built: boolean;
    originalSrc: string;
    useApi: boolean;
    thumbnails: string[];
    id?: string;
};
type LazyframeInstance = {
    el: HTMLLazyframeElement;
    settings: LazyframeSettings;
    iframe: HTMLIFrameElement;
};
declare const lazyframe: (selector: string | HTMLLazyframeElement | NodeListOf<HTMLLazyframeElement>, userOptions?: LazyframeOptions) => void;
export default lazyframe;
