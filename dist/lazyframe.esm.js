const providers = {
    youtube: {
        regex: /(?:youtube\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\?(?:\S*?&?v\=))|youtu\.be\/)([a-zA-Z0-9_-]{6,11})/,
        condition: (m) => (m && m[1].length === 11 ? m[1] : undefined),
        buildSrc: (p) => `https://www.youtube.com/embed/${p.id}/?autoplay=${p.autoplay ? '1' : '0'}&${p.query || ''}`,
    },
    youtube_nocookie: {
        regex: /(?:youtube-nocookie\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\?(?:\S*?&?v\=)))([a-zA-Z0-9_-]{6,11})/,
        condition: (m) => (m && m[1].length === 11 ? m[1] : undefined),
        buildSrc: (p) => `https://www.youtube-nocookie.com/embed/${p.id}/?autoplay=${p.autoplay ? '1' : '0'}&${p.query || ''}`,
    },
    vimeo: {
        regex: /vimeo\.com\/(?:video\/)?([0-9]*)(?:\?|)/,
        condition: (m) => (m && m[1].length > 0 ? m[1] : undefined),
        buildSrc: (p) => `https://player.vimeo.com/video/${p.id}/?autoplay=${p.autoplay ? '1' : '0'}&${p.query || ''}`,
    },
};
// --- Library Code ---
const Lazyframe = () => {
    let programmaticOptions;
    const elements = new Map();
    const DEFAULT_OPTIONS = {
        lazyload: true,
        autoplay: true,
        loadThumbnail: true,
        initinview: false,
        showPlayButton: true,
        onLoad: () => { },
        onAppend: () => { },
        onThumbnailLoad: () => { },
    };
    const constants = {
        endpoint: (s) => {
            if (s.vendor?.includes('youtube')) {
                return `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${s.id}`;
            }
            return `https://noembed.com/embed?url=${s.src}`;
        },
        response: {
            title: (r) => r.title,
            thumbnail: (r) => r.thumbnail_url,
        },
    };
    function init(selector, userOptions = {}) {
        programmaticOptions = { ...DEFAULT_OPTIONS, ...userOptions };
        const els = typeof selector === 'string' ? document.querySelectorAll(selector) : selector;
        if (els instanceof HTMLElement) {
            loop(els);
        }
        else {
            els.forEach(loop);
        }
        setObservers();
    }
    function loop(el) {
        if (!(el instanceof HTMLElement) || el.classList.contains('lazyframe--loaded'))
            return;
        // There's cases where the `lazyload` library is loaded in two
        // different scripts, so we set a flag to know if an iframe
        // was already handled by lazyload previously
        if (el.dataset.lazyloadReady === 'true')
            return;
        const settings = setup(el);
        const instance = {
            el,
            iframe: getIframe(settings),
            settings,
        };
        instance.el.addEventListener('click', () => {
            instance.el.appendChild(instance.iframe);
            instance.el.classList.add('lazyframe--activated');
            const iframe = el.querySelector('iframe');
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
        // Assign this at the end to avoid polution during the setup.
        el.dataset.lazyloadReady = 'true';
        instance.el.classList.add('lazyframe--loaded');
    }
    function setup(el) {
        const { 
        // Extract known Boolean keys
        lazyload, autoplay: dataAutoplay, initinview, loadThumbnail: dataLoadThumbnail, showPlayButton, 
        // Extract other useful variables
        src: dataSrc, vendor: dataVendor, thumbnail: dataThumbnail, 
        // Capture the rest (vendor, title, thumbnail, ratio, etc.)
        ...restDataAttrs } = el.dataset;
        // Safety check for src
        if (!dataSrc) {
            throw new Error(`Lazyframe: The 'data-src' attribute must exist. Please make sure it is defined: ${el}`);
        }
        let src = dataSrc;
        let vendor = dataVendor;
        let id;
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
        const options = {
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
            useApi: useApi(vendor, restDataAttrs.title, dataLoadThumbnail),
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
    function getQuery(src) {
        const query = src.split('?');
        return query[1] ? query[1] : undefined;
    }
    // TODO: Extract to another module.
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
    function useApi(vendor, dataTitle, thumbnail) {
        // Trim ensures we check for actual content.
        const hasTitle = dataTitle?.trim();
        const hasThumb = thumbnail?.trim();
        return !!vendor && (!hasTitle || !hasThumb);
    }
    // TODO: Extract to another module.
    function parseBoolean(value, defaultValue = false) {
        if (value === undefined || value === null)
            return defaultValue;
        return value === 'true';
    }
    async function api(instance) {
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
            const { title, thumbnail_url } = await response.json();
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
        }
        catch (error) {
            console.error('Lazyframe API call failed:', error);
            // Build the frame anyway so the user experience isn't broken
            build(instance);
        }
    }
    // TODO: Extract to another module.
    function setPlayBtn(btnTxt = 'Play') {
        const playButton = document.createElement('button');
        playButton.type = 'button';
        playButton.classList.add('lf-play-btn');
        playButton.innerHTML = `<span class="visually-hidden">${btnTxt}</span>`;
        return playButton;
    }
    function setObservers() {
        const initElement = async (instance) => {
            if (instance.settings.initialized)
                return;
            instance.settings.initialized = true;
            await api(instance);
            if (instance.settings.initinview) {
                instance.el.click();
            }
        };
        const lazyframeObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const instance = elements.get(entry.target);
                    if (instance) {
                        initElement(instance);
                        lazyframeObserver.unobserve(entry.target);
                        elements.delete(entry.target);
                    }
                }
            });
        });
        elements.forEach((instance) => {
            lazyframeObserver.observe(instance.el);
        });
    }
    function build(instance) {
        if (instance.settings.built)
            return;
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
    }
    // TODO: Extract to another module.
    function getIframe(settings) {
        const iframeNode = document.createElement('iframe');
        if (settings.id)
            iframeNode.id = `lazyframe-${settings.id}`;
        iframeNode.src = settings.src;
        iframeNode.frameBorder = '0';
        iframeNode.allowFullscreen = true;
        if (settings.autoplay) {
            iframeNode.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
        }
        return iframeNode;
    }
    function getBackgrounds(thumbnail) {
        return thumbnail.replace(/\s/g, '').split(',');
    }
    return init;
};
const lazyframe = Lazyframe();

export { lazyframe as default };
