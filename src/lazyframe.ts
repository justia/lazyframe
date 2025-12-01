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
    originalSrc: string;
    thumbnails: string[];
    id?: string;
    query?: string;
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

type VideoProvider = {
    regex: RegExp;
    condition: (match: RegExpMatchArray | null) => string | undefined;
    buildSrc: (settings: LazyframeSettings) => string;
}

const providers: Record<Vendor, VideoProvider> = {
    youtube: {
        regex: /(?:youtube\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\?(?:\S*?&?v\=))|youtu\.be\/)([a-zA-Z0-9_-]{6,11})/,
        condition: (m) => (m && m[1].length === 11 ? m[1] : undefined),
        buildSrc: (s) => `https://www.youtube.com/embed/${s.id}/?autoplay=${s.autoplay ? '1' : '0'}&${s.query || ''}`,
    },
    youtube_nocookie: {
        regex: /(?:youtube-nocookie\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\?(?:\S*?&?v\=)))([a-zA-Z0-9_-]{6,11})/,
        condition: (m) => (m && m[1].length === 11 ? m[1] : undefined),
        buildSrc: (s) =>
            `https://www.youtube-nocookie.com/embed/${s.id}/?autoplay=${s.autoplay ? '1' : '0'}&${s.query || ''}`,
    },
    vimeo: {
        regex: /vimeo\.com\/(?:video\/)?([0-9]*)(?:\?|)/,
        condition: (m) => (m && m[1].length > 0 ? m[1] : undefined),
        buildSrc: (s) => `https://player.vimeo.com/video/${s.id}/?autoplay=${s.autoplay ? '1' : '0'}&${s.query || ''}`,
    },
};

// --- Library Code ---

const Lazyframe = () => {
    let programmaticOptions: LazyframeOptions;
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

        // TODO:
        // Observers are currently initialized regardless of the value set with the `data-lazyload` attribute.
        // Right now, the only way to configure this behavior is by passing a `lazyload` option when calling
        // the `lazyframe` function:
        //
        // ```
        // lazyframe('.selector', { lazyload: false });
        // ```
        //
        // If all elements found during initialization have `data-lazyload="false"`, the observer is still created,
        // but it should not be.
        //
        // A better approach would be to use a global flag like `enableLazyloadObserver`, initialized to `false`.
        // During initialization, if any element has `data-lazyload="true"`, the flag would be set to `true`.
        //
        // This ensures the observer is only created when at least one element actually requires lazy loading.
        //
        if (programmaticOptions.lazyload) {
            setObservers();
        }
    }

    function loop(el: HTMLLazyframeElement): void {
        if (!(el instanceof HTMLElement) || el.classList.contains('lazyframe--loaded')) return;

        // There's cases where the `lazyload` library is loaded in two
        // different scripts, so we set a flag to know if an iframe
        // was already handled by lazyload previously
        if (el.dataset.lazyloadReady === 'true') return;

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

        if (instance.settings.lazyload) {
            build(instance);
        } else {
            api(instance);
        }

        // Assign this at the end to avoid polution during the setup.
        el.dataset.lazyloadReady = 'true';
    }

    function setup(el: HTMLLazyframeElement): LazyframeSettings {
        const {
            // Extract known Boolean keys
            lazyload,
            autoplay,
            initinview,
            loadThumbnail: dataLoadThumbnail,
            showPlayButton,

            // Extract other useful variables
            src,
            vendor: dataVendor,
            thumbnail: dataThumbnail,

            // Capture the rest (vendor, title, thumbnail, ratio, etc.)
            ...restDataAttrs
        } = el.dataset;

        // Safety check for src
        if (!src) {
            throw new Error(`Lazyframe: The 'data-src' attribute must exist. Please make sure it is defined: ${el}`);
        }

        let vendor = dataVendor;
        let id: LazyframeSettings['id'];
        const loadThumbnail = parseBoolean(dataLoadThumbnail, programmaticOptions.loadThumbnail);
        const thumbnails = loadThumbnail && dataLoadThumbnail ? getBackgrounds(dataLoadThumbnail) : [];

        if (src.includes('youtube-nocookie')) {
            vendor = 'youtube_nocookie';
        }

        if (vendor) {
            const provider = providers[vendor];

            const match = src.match(provider.regex);
            id = provider.condition(match);
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
            originalSrc: src,
            query: getQuery(src),
            // Parse booleans with defaults and override programmatic options if `data-*` attributes were defined.
            lazyload: parseBoolean(lazyload, programmaticOptions.lazyload),
            autoplay: parseBoolean(autoplay, programmaticOptions.autoplay),
            initinview: parseBoolean(initinview, programmaticOptions.initinview),
            loadThumbnail,
            showPlayButton: parseBoolean(showPlayButton, programmaticOptions.showPlayButton),
        };

        return options;
    }

    function getQuery(src: string): string | undefined {
        const query = src.split('?');
        return query[1] ? query[1] : undefined;
    }

    /**
     * Checks if missing data needs to be fetched from the API.
     *
     * The function returns `true` only if a valid Vendor exists, but
     * the local data is incomplete (missing either a title or a thumbnail).
     *
     * Logic Matrix:
     * - No Vendor                -> false
     * - Vendor + Title + Thumb   -> false (Data complete)
     * - Vendor + No Title        -> true
     * - Vendor + No Thumb        -> true
     *
     * @param [vendor] - The target vendor.
     * @param [dataTitle] - The current title (if any).
     * @param [thumbnail] - The current thumbnail (if any).
     * @returns `true` if the API needs to be called to backfill missing data.
     */
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
            if (!instance.settings.thumbnails.length && instance.settings.loadThumbnail) {
                instance.settings.thumbnails = getBackgrounds(data.thumbnail_url);

                if (instance.settings.onThumbnailLoad) {
                    instance.settings.onThumbnailLoad(data.thumbnail_url);
                }
            }

            build(instance, true);
        } catch (error) {
            console.error('Lazyframe API call failed:', error);
            // Build the frame anyway so the user experience isn't broken
            build(instance, true);
        }
    }

    function setPlayBtn(btnTxt = 'Play'): HTMLButtonElement {
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

            api(instance);

            if (instance.settings.initinview) {
                instance.el.click();
            }

            if (instance.settings.onLoad) {
                instance.settings.onLoad(instance);
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

    function build(instance: LazyframeInstance, loadthumbnailOnInit = false): void {
        if (loadthumbnailOnInit && instance.settings.thumbnails.length) {
            console.log(`[build] [${instance.el.id}] call setBackground`);
            setBackground(instance.el, instance.settings.thumbnails);
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

        if (!instance.settings.lazyload) {
            instance.el.classList.add('lazyframe--loaded');
            if (instance.settings.onLoad) {
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

    function setBackground(el: HTMLElement, [img1, img2]: string[]) {
        el.style.backgroundImage = img2
            ? `-webkit-image-set(url('${img1}') 1x, url('${img2}') 1x)`
            : `url('${img1}')`;
    }

    return init;
};

const lazyframe = Lazyframe();

export default lazyframe;
