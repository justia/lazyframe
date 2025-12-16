import './scss/lazyframe.scss';

// --- Type Definitions ---

type Vendor = 'youtube' | 'youtube_nocookie' | 'vimeo';
type AspectRatio = '16:9' | '4:3' | '1:1';
type StringBoolean = 'true' | 'false';
// Helper to verify if a value is strictly 'true' | 'false'.
type ConvertStringBool<T> = T extends StringBoolean ? boolean : T;

// Options the user can set during a programmatic initialization.
type LazyframeOptions = {
    lazyload?: boolean;
    autoplay?: boolean;
    initinview?: boolean;
    loadThumbnail?: boolean;
    showPlayButton?: boolean;
    onLoad?: (instance: LazyframeInstance) => void;
    onAppend?: (iframe: HTMLIFrameElement) => void;
    onThumbnailLoad?: (imgUrl: string) => void;
}

// Defines all the possible `data-*` attributes that the element could have.
type LazyframeDatasetStringOptions = {
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
    // Programatically added. Is not meant to be set manually by the user.
    lazyloadReady?: StringBoolean;
};

// 2. The Transformation Type
type LazyframeDatasetOptions = {
    // Iterate over every key EXCEPT 'lazyloadReady'
    [K in keyof Omit<LazyframeDatasetStringOptions, 'lazyloadReady'>]:
        // Apply the conversion helper to the value
        ConvertStringBool<LazyframeDatasetStringOptions[K]>
};

interface HTMLLazyframeElement extends HTMLElement {
    dataset: LazyframeDatasetStringOptions;
}

// Fully resolved settings for an instance, merging defaults, user settings, data-attributes and extra values defined during execution.
// `thumbnail` ommited because internally the value is transformed into an array of strings to set the inline background.
type LazyframeSettings = LazyframeOptions & Omit<LazyframeDatasetOptions, 'thumbnail'> & {
    initialized: boolean;
    built: boolean;
    originalSrc: string;
    useApi: boolean;
    thumbnails: string[];
    id?: string;
};

// The internal representation of a single lazyframe instance
type LazyframeInstance = {
    el: HTMLLazyframeElement;
    settings: LazyframeSettings;
    iframe: HTMLIFrameElement;
}

type NoEmbedResponse = {
    title: string;
    thumbnail_url: string;
}

type VideoParams = {
    id: string;
    autoplay: boolean;
    query?: string;
}

type VideoProvider = {
    regex: RegExp;
    condition: (match: RegExpMatchArray | null) => string | undefined;
    buildSrc: (params: VideoParams) => string;
}

const providers: Record<Vendor, VideoProvider> = {
    youtube: {
        regex: /(?:youtube\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\?(?:\S*?&?v\=))|youtu\.be\/)([a-zA-Z0-9_-]{6,11})/,
        condition: (m) => (m && m[1].length === 11 ? m[1] : undefined),
        buildSrc: (p) => `https://www.youtube.com/embed/${p.id}/?autoplay=${p.autoplay ? '1' : '0'}&${p.query || ''}`,
    },
    youtube_nocookie: {
        regex: /(?:youtube-nocookie\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\?(?:\S*?&?v\=)))([a-zA-Z0-9_-]{6,11})/,
        condition: (m) => (m && m[1].length === 11 ? m[1] : undefined),
        buildSrc: (p) =>
            `https://www.youtube-nocookie.com/embed/${p.id}/?autoplay=${p.autoplay ? '1' : '0'}&${p.query || ''}`,
    },
    vimeo: {
        regex: /vimeo\.com\/(?:video\/)?([0-9]*)(?:\?|)/,
        condition: (m) => (m && m[1].length > 0 ? m[1] : undefined),
        buildSrc: (p) => `https://player.vimeo.com/video/${p.id}/?autoplay=${p.autoplay ? '1' : '0'}&${p.query || ''}`,
    },
};

// --- Library Code ---

const Lazyframe = () => {
    let programmaticOptions: Partial<LazyframeSettings>;
    const elements: Map<HTMLLazyframeElement, LazyframeInstance> = new Map();
    const DEFAULT_OPTIONS: Partial<LazyframeSettings> = {
        lazyload: true,
        autoplay: true,
        loadThumbnail: true,
        initinview: false,
        showPlayButton: true,
        onLoad: () => {},
        onAppend: () => {},
        onThumbnailLoad: () => {},
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

    function init(selector: string | HTMLLazyframeElement | NodeListOf<HTMLLazyframeElement>, userOptions: LazyframeOptions = {}): void {
        programmaticOptions = { ...DEFAULT_OPTIONS , ...userOptions };

        const els = typeof selector === 'string' ? document.querySelectorAll<HTMLLazyframeElement>(selector) : selector;

        if (els instanceof HTMLElement) {
            loop(els);
        } else {
            els.forEach(loop);
        }

        setObservers();
    }

    function loop(el: HTMLLazyframeElement): void {
        if (!(el instanceof HTMLElement) || el.classList.contains('lazyframe--loaded')) return;

        const settings = setup(el);
        const instance: LazyframeInstance = {
            el,
            iframe: getIframe(settings),
            settings,
        };

        instance.el.addEventListener('click', () => {
            instance.el.appendChild(instance.iframe);

            instance.el.classList.add('lazyframe--activated');

            const iframe = el.querySelector<HTMLIFrameElement>('iframe');

            if (iframe && instance.settings.onAppend) {
                instance.settings.onAppend(iframe);
            }
        });

        if (!instance.settings.lazyload) {
            api(instance);
        }

        if (!elements.has(instance.el)) {
            // Subscribe to observer regardless if the element was force to load with `data-lazyload="false"` or not.
            elements.set(instance.el, instance);
        }

        instance.el.classList.add('lazyframe--loaded');
    }

    function setup(el: HTMLLazyframeElement): LazyframeSettings {
        const {
            // Extract known Boolean keys
            lazyload,
            autoplay: dataAutoplay,
            initinview,
            loadThumbnail: dataLoadThumbnail,
            showPlayButton,

            // Extract other useful variables
            src: dataSrc,
            vendor: dataVendor,
            thumbnail: dataThumbnail,

            // Capture the rest (vendor, title, thumbnail, ratio, etc.)
            ...restDataAttrs
        } = el.dataset;

        // Safety check for src
        if (!dataSrc) {
            throw new Error(`Lazyframe: The 'data-src' attribute must exist. Please make sure it is defined: ${el}`);
        }

        let src = dataSrc;
        let vendor = dataVendor;
        let id: LazyframeSettings['id'];
        const loadThumbnail = parseBoolean(dataLoadThumbnail, programmaticOptions.loadThumbnail);
        const thumbnails = loadThumbnail && dataThumbnail ? getBackgrounds(dataThumbnail) : [];
        const autoplay = parseBoolean(dataAutoplay, programmaticOptions.autoplay);
        const query = getQuery(dataSrc);

        if (dataSrc.includes('youtube-nocookie')) {
            vendor = 'youtube_nocookie';
        }

        if (vendor) {
            const provider = providers[vendor];

            const match = dataSrc.match(provider.regex);
            id = provider.condition(match);

            if (id) {
                src = provider.buildSrc({ id, autoplay, query });
            }
        }

        // Merge defaults, user settings, and data attributes in order of precedence
        const options: LazyframeSettings = {
            // First spread programmating options. Specifically `onLoad`, `onAppend` and `onThumbnailLoad`.
            ...programmaticOptions,

            // Spread the remaining data attributes defined on each element.
            ...restDataAttrs,

            // Set props that could only be obtained through `data-*` attributes.
            src,
            vendor,
            id,
            thumbnails,

            // Set extra info.
            initialized: false, // Always start as not initialized
            built: false,
            originalSrc: dataSrc,
            useApi: useApi(vendor, restDataAttrs.title, dataThumbnail, loadThumbnail),

            // Parse booleans with defaults and override programmatic options if `data-*` attributes were defined.
            lazyload: parseBoolean(lazyload, programmaticOptions.lazyload),
            autoplay,
            initinview: parseBoolean(initinview, programmaticOptions.initinview),
            loadThumbnail,
            showPlayButton: parseBoolean(showPlayButton, programmaticOptions.showPlayButton),
        };

        return options;
    }

    // TODO: Extract to another module.
    function getQuery(src: string): string | undefined {
        const query = src.split('?');
        return query[1] ? query[1] : undefined;
    }

    // TODO: Extract to another module.
    /**
     * Checks if missing data needs to be fetched from the API.
     *
     * The function returns `true` only if a valid Vendor exists, but
     * the local data is incomplete.
     *
     * Logic Matrix:
     * - No Vendor                                     -> false
     * - Vendor + Title + Thumb                        -> false (Data complete)
     * - Vendor + Title + (Thumb?) + LoadThumb=False   -> false (Data complete. Thumb ignored)
     * - Vendor + Title                                -> true  (Need Thumb)
     * - Vendor + Thumb + LoadThumb=True               -> true  (Need Title)
     * - Vendor + Thumb + LoadThumb=False              -> true  (Need Title)
     *
     * @param [vendor] - The target vendor.
     * @param [dataTitle] - The current title (if any).
     * @param [thumbnail] - The current thumbnail (if any).
     * @param [loadThumbnail] - Whether the thumbnail should be displayed.
     * @returns `true` if the API needs to be called to backfill missing data.
     */
    function useApi(vendor?: Vendor, dataTitle?: string, thumbnail?: string, loadThumbnail?: boolean): boolean {
        // Trim ensures we check for actual content.
        const hasTitle = dataTitle?.trim();
        const hasThumb = thumbnail?.trim();

        return !!vendor && (!hasTitle || (!!loadThumbnail && !hasThumb));
    }

    // TODO: Extract to another module.
    function parseBoolean(value: string | undefined, defaultValue: boolean = false): boolean {
        if (value === undefined || value === null) return defaultValue;
        return value === 'true';
    }

    async function api(instance: LazyframeInstance): Promise<void> {
        if (!instance.settings.useApi) {
            build(instance);
            return;
        }

        // Ensures the data for the element is not fetched again if this function is called mutliple times.
        instance.settings.useApi = false;

        const endpoint = constants.endpoint(instance.settings);

        try {
            const response = await fetch(endpoint);
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }
            const { title, thumbnail_url }: NoEmbedResponse = await response.json();

            if (!instance.settings.title) {
                instance.settings.title = title;
            }
            if (!instance.settings.thumbnails.length && instance.settings.loadThumbnail) {
                instance.settings.thumbnails = getBackgrounds(thumbnail_url);

                if (instance.settings.onThumbnailLoad) {
                    instance.settings.onThumbnailLoad(thumbnail_url);
                }
            }

            build(instance);
        } catch (error) {
            console.error('Lazyframe API call failed:', error);
            // Build the frame anyway so the user experience isn't broken
            build(instance);
        }
    }

    // TODO: Extract to another module.
    function setPlayBtn(btnTxt = 'Play'): HTMLButtonElement {
        const playButton = document.createElement('button');
        playButton.type = 'button';
        playButton.classList.add('lf-play-btn');
        playButton.innerHTML = `<span class="visually-hidden">${btnTxt}</span>`;
        return playButton;
    }

    function setObservers(): void {
        const initElement = async (instance: LazyframeInstance) => {
            if (instance.settings.initialized) return;

            instance.settings.initialized = true;

            await api(instance);

            if (instance.settings.initinview) {
                instance.el.click();
            }
        };

        const lazyframeObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const instance = elements.get(entry.target as HTMLLazyframeElement);

                    if (instance) {
                        initElement(instance);
                        lazyframeObserver.unobserve(entry.target);
                        elements.delete(entry.target as HTMLLazyframeElement);
                    }
                }
            });
        });

        elements.forEach((instance) => {
            lazyframeObserver.observe(instance.el);
        });
    }

    function build(instance: LazyframeInstance): void {
        if (instance.settings.built) return;

        if (instance.settings.thumbnails.length) {
            const [img1, img2] = instance.settings.thumbnails;

            instance.el.style.backgroundImage = img2
                ? `-webkit-image-set(url('${img1}') 1x, url('${img2}') 1x)`
                : `url('${img1}')`;
        }

        if (instance.settings.title && !instance.el.querySelector('.lazyframe__title')) {
            const titleNode = document.createElement('span');

            titleNode.className = 'lazyframe__title';
            titleNode.textContent = instance.settings.title;
            instance.el.appendChild(titleNode);
        }

        if (instance.settings.showPlayButton) {
            instance.el.appendChild(setPlayBtn());
        }

        if (instance.settings.onLoad) {
            instance.settings.onLoad(instance);
        }

        // If this function is called during setup or by the intersection observer,
        // ensure the build only occurs once.
        instance.settings.built = true;
        instance.el.classList.add('lazyframe--ready');
    }

    // TODO: Extract to another module.
    function getIframe(settings: LazyframeSettings): HTMLIFrameElement {
        const iframeNode = document.createElement('iframe');

        if (settings.id) iframeNode.id = `lazyframe-${settings.id}`;

        iframeNode.src = settings.src;
        iframeNode.frameBorder = '0';
        iframeNode.allowFullscreen = true;

        if (settings.autoplay) {
            iframeNode.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
        }

        return iframeNode;
    }

    function getBackgrounds(thumbnail: string): string[] {
        return thumbnail.replace(/\s/g, '').split(',');
    }

    return init;
};

const lazyframe = Lazyframe();

export default lazyframe;
