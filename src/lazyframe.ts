import './scss/lazyframe.scss';

// --- Type Definitions ---

type Vendor = 'youtube' | 'youtube_nocookie' | 'vimeo';

// Options the user can pass during initialization
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

// Fully resolved settings for an instance, merging defaults and data-attributes
interface LazyframeSettings extends LazyframeOptions {
    initialized: boolean;
    originalSrc?: string;
    query?: string | null;
}

// The internal representation of a single lazyframe instance
interface LazyframeInstance {
    el: HTMLElement;
    settings: LazyframeSettings;
    iframe?: HTMLIFrameElement;
}

interface NoEmbedResponse {
    title: string;
    thumbnail_url: string;
}

interface VideoProvider {
    regex: RegExp;
    condition: (match: RegExpMatchArray | null) => string | false;
    buildSrc: (settings: LazyframeSettings) => string;
}

const providers: Record<Vendor, VideoProvider> = {
    youtube: {
        regex: /(?:youtube\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\?(?:\S*?&?v\=))|youtu\.be\/)([a-zA-Z0-9_-]{6,11})/,
        condition: (m) => (m && m[1].length === 11 ? m[1] : false),
        buildSrc: (s) => `https://www.youtube.com/embed/${s.id}/?autoplay=${s.autoplay ? "1" : "0"}&${s.query || ''}`,
    },
    youtube_nocookie: {
        regex: /(?:youtube-nocookie\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\?(?:\S*?&?v\=)))([a-zA-Z0-9_-]{6,11})/,
        condition: (m) => (m && m[1].length === 11 ? m[1] : false),
        buildSrc: (s) => `https://www.youtube-nocookie.com/embed/${s.id}/?autoplay=${s.autoplay ? "1" : "0"}&${s.query || ''}`,
    },
    vimeo: {
        regex: /vimeo\.com\/(?:video\/)?([0-9]*)(?:\?|)/,
        condition: (m) => (m && m[1].length > 0) ? m[1] : false,
        buildSrc: (s) => `https://player.vimeo.com/video/${s.id}/?autoplay=${s.autoplay ? "1" : "0"}&${s.query || ''}`,
    },
};

// --- Library Code ---

    const Lazyframe = () => {
    let settings: LazyframeOptions;
    const elements: Map<HTMLElement, LazyframeInstance> = new Map();
    const defaults: LazyframeSettings = {
        initialized: false,
        lazyload: true,
        autoplay: true,
        loadThumbnail: true,
        initinview: false,
        showPlayButton: true,
        onLoad: () => {},
        onAppend: () => {},
        onThumbnailLoad: () => {}
    };

    const constants = {
        endpoint: (s: LazyframeSettings): string => {
            if (s.vendor?.includes('youtube')) {
                return `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${s.id}`;
            }
            return `https://noembed.com/embed?url=${s.src}`;
        },
        response: {
            title: (r: { title: string }): string => r.title,
            thumbnail: (r: { thumbnail_url: string }): string => r.thumbnail_url,
        },
    };

    function init(selector: string | HTMLElement | NodeListOf<HTMLElement>, userOptions?: LazyframeOptions): void {
        settings = { ...defaults, ...userOptions };

        const els = typeof selector === 'string' ? document.querySelectorAll<HTMLElement>(selector) : selector;

        if (els instanceof HTMLElement) {
            loop(els);
        } else {
            els.forEach(loop);
        }

        if (settings.lazyload) {
            setObservers();
        }
    }

    function loop(el: HTMLElement): void {
        if (!(el instanceof HTMLElement) || el.classList.contains('lazyframe--loaded')) return;

        const instance: LazyframeInstance = {
            el: el,
            settings: setup(el),
        };

        // There's cases where the `lazyload` library is loaded in two
        // different scripts, so we set a flag to know if an iframe
        // was already handled by lazyload previously
        if (instance.el.dataset.lazyloadReady === '1') return;

        instance.el.dataset.lazyloadReady = '1';

        instance.el.addEventListener('click', () => {
            if (instance.iframe) {
                instance.el.appendChild(instance.iframe);
            }

            instance.el.classList.add('lazyframe--activated');

            const iframe = el.querySelector<HTMLIFrameElement>('iframe');

            if (iframe && instance.settings.onAppend) {
                instance.settings.onAppend(iframe);
            }
        });

        if (settings.lazyload) {
            build(instance);
        } else {
            api(instance);
        }
    }

    function setup(el: HTMLElement): LazyframeSettings {
        const data = { ...el.dataset };
        
        // Merge defaults, user settings, and data attributes in order of precedence
        const initialOptions: LazyframeSettings = {
            ...settings, // Global settings
            ...data,     // Data attributes (will overwrite global settings if present)
            initialized: false, // Always start as not initialized
            originalSrc: data.src,
            query: getQuery(data.src)
        };

        // Explicitly parse boolean attributes, ensuring they take final precedence
        const options: LazyframeSettings = {
            ...initialOptions,
            lazyload: parseBoolean(data.lazyload, initialOptions.lazyload),
            autoplay: parseBoolean(data.autoplay, initialOptions.autoplay),
            initinview: parseBoolean(data.initinview, initialOptions.initinview),
            loadThumbnail: parseBoolean(data.loadThumbnail, initialOptions.loadThumbnail),
            showPlayButton: parseBoolean(data.showPlayButton, initialOptions.showPlayButton),
        };

        if (options.src?.includes('youtube-nocookie')) {
            options.vendor = 'youtube_nocookie';
        }

        if (options.vendor && options.src) {
            const provider = providers[options.vendor];

            if (provider) {
                const match = options.src.match(provider.regex);
                const id = provider.condition(match);

                if (id) {
                    options.id = id;
                }
            }
        }

        return options;
    }

    function getQuery(src: string | undefined): string | null {
        if (!src) return null;
        const query = src.split('?');
        return query[1] ? query[1] : null;
    }

    function useApi(settings: LazyframeSettings): boolean {
        if (!settings.vendor) return false;
        return !settings.title || !settings.thumbnail;
    }

    function parseBoolean(value: string | undefined, defaultValue: boolean = false): boolean {
        if (value === undefined || value === null) return defaultValue;
        return value === 'true';
    }

    async function api(instance: LazyframeInstance): Promise<void> {
        if (!useApi(instance.settings)) {
            build(instance, true);
            return;
        }

        const endpoint = constants.endpoint(instance.settings);

        try {
            const response = await fetch(endpoint);
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }
            const data: NoEmbedResponse = await response.json();

            if (!instance.settings.title) {
                instance.settings.title = data.title;
            }
            if (!instance.settings.thumbnail) {
                const url = data.thumbnail_url;
                instance.settings.thumbnail = url;
                if (instance.settings.onThumbnailLoad) {
                    instance.settings.onThumbnailLoad(url);
                }
            }
            
            build(instance, true);

        } catch (error) {
            console.error("Lazyframe API call failed:", error);
            // Build the frame anyway so the user experience isn't broken
            build(instance, true); 
        }
    }

    function setPlayBtn(btnTxt: string = 'Play'): HTMLButtonElement {
        const playButton = document.createElement('button');
        playButton.type = 'button';
        playButton.classList.add('lf-play-btn');
        playButton.innerHTML = `<span class="visually-hidden">${btnTxt}</span>`;
        return playButton;
    }

    function setObservers(): void {
        const initElement = (instance: LazyframeInstance) => {
            if (instance.settings.initialized) return;

            instance.settings.initialized = true;
            instance.el.classList.add('lazyframe--loaded');
            if (instance.settings.showPlayButton) {
                instance.el.appendChild(setPlayBtn());
            }
            api(instance);

            if (instance.settings.initinview) {
                instance.el.click();
            }

            if (instance.settings.onLoad) {
                instance.settings.onLoad(instance);
            }
        }

        if ('IntersectionObserver' in window) {
            const lazyframeObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const instance = elements.get(entry.target as HTMLElement);
                        if (instance) {
                            initElement(instance);
                            lazyframeObserver.unobserve(entry.target);
                            elements.delete(entry.target as HTMLElement);
                        }
                    }
                });
            });

            elements.forEach((instance) => {
                lazyframeObserver.observe(instance.el);
            });
        } else {
            elements.forEach(initElement);
        }
    }

    function build(instance: LazyframeInstance, loadImage?: boolean): void {
        instance.iframe = getIframe(instance.settings);

        if (instance.settings.thumbnail && loadImage && instance.settings.loadThumbnail) {
            const thumbnails = instance.settings.thumbnail.replace(/\s/g, '').split(',');

            if (thumbnails.length > 1) {
                const imageSet = `url('${thumbnails[0]}') 1x, url('${thumbnails[1]}') 1x`;
                instance.el.style.backgroundImage = `-webkit-image-set(${imageSet})`;
            } else {
                instance.el.style.backgroundImage = `url('${thumbnails[0]}')`;
            }
        }

        if (instance.settings.title && !instance.el.querySelector('.lazyframe__title')) {
            const titleNode = document.createElement('span');
            titleNode.className = 'lazyframe__title';
            titleNode.textContent = instance.settings.title;
            instance.el.appendChild(titleNode);
        }

        if (!settings.lazyload) {
            instance.el.classList.add('lazyframe--loaded');
            if(instance.settings.onLoad) {
                instance.settings.onLoad(instance);
            }
        }

        if (!instance.settings.initialized) {
            elements.set(instance.el, instance);
        }
    }

    function getIframe(settings: LazyframeSettings): HTMLIFrameElement {
        const iframeNode = document.createElement('iframe');

        if (settings.vendor && providers[settings.vendor]) {
            settings.src = providers[settings.vendor].buildSrc(settings);
        }

        iframeNode.setAttribute('id', `lazyframe-${settings.id}`);
        iframeNode.setAttribute('src', settings.src || '');
        iframeNode.setAttribute('frameborder', '0');
        iframeNode.setAttribute('allowfullscreen', '');

        if (settings.autoplay) {
            iframeNode.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
        }

        return iframeNode;
    }
    return init;
}

const lazyframe = Lazyframe();

export default lazyframe;