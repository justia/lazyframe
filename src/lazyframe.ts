// lazyframe.ts

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
        condition: (m) => (m && (m[1].length === 10 || m[1].length === 9 || m[1].length === 8)) ? m[1] : false,
        buildSrc: (s) => `https://player.vimeo.com/video/${s.id}/?autoplay=${s.autoplay ? "1" : "0"}&${s.query || ''}`,
    },
};

// --- Library Code ---

const Lazyframe = () => {
    let settings: LazyframeOptions;
    const elements: LazyframeInstance[] = [];

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
            if (s.vendor === 'youtube') {
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
        const dataAttributes = { ...el.dataset };

        const options: LazyframeSettings = {
            ...settings,
            ...dataAttributes,
            initialized: false, // Ensure this is reset per-instance
            originalSrc: dataAttributes.src,
            query: getQuery(dataAttributes.src)
        };

        // Coerce boolean data-attributes from string to boolean
        ['lazyload', 'autoplay', 'initinview', 'loadThumbnail', 'showPlayButton'].forEach(option => {
            const key = option as keyof LazyframeOptions;
            if (options[key] === 'true') {
                (options as any)[key] = true;
            } else if (options[key] === 'false') {
                (options as any)[key] = false;
            }
        });

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

    function api(instance: LazyframeInstance): void {
        if (useApi(instance.settings)) {
            send(instance, (err, data) => {
                if (err || !data) return;

                const response = data[0];
                const _instance = data[1];

                if (!_instance.settings.title) {
                    _instance.settings.title = constants.response.title(response);
                }
                if (!_instance.settings.thumbnail) {
                    const url = constants.response.thumbnail(response);
                    _instance.settings.thumbnail = url;
                    if (_instance.settings.onThumbnailLoad) {
                        _instance.settings.onThumbnailLoad(url);
                    }
                }
                build(_instance, true);
            });
        } else {
            build(instance, true);
        }
    }

    function send(instance: LazyframeInstance, cb: (err: boolean | null, data?: [any, LazyframeInstance]) => void): void {
        const endpoint = constants.endpoint(instance.settings);
        const request = new XMLHttpRequest();

        request.open('GET', endpoint, true);

        request.onload = function () {
            if (request.status >= 200 && request.status < 400) {
                const data = JSON.parse(request.responseText);
                cb(null, [data, instance]);
            } else {
                cb(true);
            }
        };

        request.onerror = function () { cb(true); };
        request.send();
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
                        const instance = elements.find(element => element.el === entry.target);
                        if (instance) {
                            initElement(instance);
                            lazyframeObserver.unobserve(entry.target);
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

        if (instance.settings.title && instance.el.children.length === 0) {
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
            elements.push(instance);
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