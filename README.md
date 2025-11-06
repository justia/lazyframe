# Lazyframe
[![Node.js Package](https://github.com/justia/lazyframe/actions/workflows/npm-publish.yml/badge.svg)](https://github.com/justia/lazyframe/actions/workflows/npm-publish.yml)
[![npm version](https://badge.fury.io/js/lazyframe.svg)](https://badge.fury.io/js/lazyframe)

Dependency-free library for lazyloading iframes. [Demo](https://vb.github.io/lazyframe/)

## Why?

Because embedded content takes time to load.

- **Youtube** – 11 requests ≈ 580kb
- **Google maps** – 52 requests ≈ 580kb
- **Vimeo** – 8 requests ≈ 145kb

Lazyframe creates a responsive placeholder for embedded content and requests it only when the user interacts with it. This decreases page load and idle time.

Lazyframe comes with brand-like themes for Youtube and Vimeo.

1. [Install](#install)
2. [Import](#import)
3. [Initialize](#initialize)
4. [Options](#options)

### Install

NPM

```bash
$ npm install @justia/lazyframe --save
```

Bower

```bash
$ bower install lazyframe
```

### Import

JavaScript ES6 imports

```js
import lazyframe from "@justia/lazyframe";
```

Include JavaScript in html

```html
<script src="dist/lazyframe.min.js"></script>
```

Sass import

```scss
@forward 'src/scss/lazyframe'
```

Include css in html

```html
<link rel="stylesheet" href="dist/lazyframe.css" />
```

### Initialize

The `lazyframe` function accepts a CSS selector, a single DOM element, or a collection of elements (like a `NodeList` or jQuery object).

```js
// Passing a selector string
lazyframe(".lazyframe");

// Passing a NodeList
const elements = document.querySelectorAll(".lazyframe");
lazyframe(elements);

// Passing a single element
const element = document.querySelector(".lazyframe");
lazyframe(element);
```

## Options

Configuration can be applied globally during initialization or on a per-element basis using `data-*` attributes. Element-specific attributes will always override global options.

### General Options

These options are passed as an object during initialization and apply to all instances unless overridden by a `data-*` attribute.

```js
lazyframe(elements, {
  lazyload: true,
  autoplay: true,
  initinview: false,
  showPlayButton: true,
  loadThumbnail: true,

  // Callbacks
  onLoad: (lazyframe) => console.log(lazyframe),
  onAppend: (iframe) => console.log(iframe),
  onThumbnailLoad: (img) => console.log(img),
});
```

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `lazyload` | `(boolean)` | `true` | If `true`, uses `IntersectionObserver` to initialize only when the element is in the viewport. If `false`, initializes all elements on page load. |
| `autoplay` | `(boolean)` | `true` | If `true`, the embedded content will attempt to play automatically after the user clicks the placeholder. Sets `autoplay=1` in the iframe `src` and adds `autoplay` to the `allow` attribute. |
| `initinview` | `(boolean)` | `false` | If `true`, the iframe is immediately initialized (as if clicked) when the element enters the viewport. Requires `lazyload: true`. |
| `showPlayButton` | `(boolean)` | `true` | If `false`, the play button graphic will not be added to the placeholder. |
| `loadThumbnail` | `(boolean)` | `true` | If `false`, the fetched thumbnail image will not be applied as a background to the placeholder. |
| `onLoad` | `(function)` | ` ` | Callback function fired when an element is initialized (i.e., enters the viewport or on page load if `lazyload` is `false`). Receives the lazyframe instance object. |
| `onAppend` | `(function)` | ` ` | Callback function fired after the `iframe` is appended to the DOM upon user interaction. Receives the `iframe` element. |
| `onThumbnailLoad` | `(function)` | ` ` | Callback function fired after a thumbnail URL is successfully fetched from the `noembed.com` API. Receives the image URL string. |

### Element-Specific Options (Data Attributes)

These options are set as `data-*` attributes directly on the HTML element.

```html
<div
  class="lazyframe"
  data-src="https://www.youtube.com/embed/ara1uUvajoU"
  data-vendor="youtube"
  data-title="Custom Title"
  data-thumbnail="https://example.com/custom-thumb.jpg"
  data-ratio="16:9"
  data-autoplay="false"
  data-initinview="true"
  data-show-play-button="false"
  data-load-thumbnail="false"
></div>
```

| Attribute | Description |
| :--- | :--- |
| `data-src` | **Required.** The source URL for the content you want to lazy-load. Any query parameters on this URL will be preserved. |
| `data-vendor` | Specifies the vendor for theming the placeholder. Supported values: `youtube`, `youtube_nocookie`, `vimeo`. |
| `data-title` | Sets a custom title. If omitted for a known vendor, the title is fetched from the `noembed.com` API. |
| `data-thumbnail` | Sets a custom thumbnail URL. If omitted for a known vendor, the thumbnail is fetched from the API. |
| `data-ratio` | Controls the aspect ratio of the placeholder. Possible values: `16:9`, `4:3`, `1:1`. |
| `data-lazyload` | Overrides the global `lazyload` setting. Set to `"false"` to force this instance to initialize on page load. |
| `data-autoplay` | Overrides the global `autoplay` setting. Set to `"false"` to prevent autoplay for this instance. |
| `data-initinview` | Overrides the global `initinview` setting. Set to `"true"` to initialize the iframe when it enters the viewport. |
| `data-show-play-button` | Overrides the global `showPlayButton` setting. Set to `"false"` to prevent the play button from being added. |
| `data-load-thumbnail` | Overrides the global `loadThumbnail` setting. Set to `"false"` to prevent the thumbnail background from being applied. |

## License

[MIT](https://opensource.org/licenses/MIT). © 2016 Viktor Bergehall