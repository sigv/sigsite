# sigsite

*Simplicity re-imagined.*

## What is this?

Generally speaking, this is a [static](https://en.wiktionary.org/wiki/static "Unchanging; that cannot or does not change.") [website](https://en.wiktionary.org/wiki/website "Alternative spelling of web site") [delivery](https://en.wiktionary.org/wiki/delivery "The act of conveying something.") [framework](https://en.wiktionary.org/wiki/framework "(figuratively, especially in, computing) A basic conceptual structure.").

It also comes with an awesome simple sample site as a demonstration of the functionality.

## How does it work?

The basic idea is real basic indeed. You have a template HTML file at the root of the project, named `/template.html`. Then you have a bunch of section HTML files, inside `/sections/`. Those will get imploded into the template file. Some additional magic takes place and the browser gets those sections presented as full webpages.

It depends on the [Node.js](https://nodejs.org/) platform for the core features, the [Express](http://expressjs.com/) web framework for easier web-servering, awesome custom sauce for awesomeness and a few additional packages, which can be seen in the `/package.json` file.

## Sounds good, but how do I try this out?

You can look at the demonstration at [sigsite.herokuapp.com](https://sigsite.herokuapp.com/). That is a clone of this repository deployed as a [Heroku](https://www.heroku.com/) app. In fact, you can deploy it yourself right away and get the same result, if you don't believe it to be that simple.

### What exactly do I need to do to get custom content?

1. Clone this repository locally to work on it. No, seriously.
2. Run `npm install` to get the dependencies locally. You should have installed [npm](https://www.npmjs.com/) along with [Node.js](https://nodejs.org/), if everything went as planned.
3. Run `echo '' > cache.mf ; echo '' > template.html ; rm -rf style.scss public/* sections/*` to get rid of all content. You don't want the sample site around when adding your new content.
4. Put your custom baseline HTML inside `/template.html`, including a `{{section}}` at the spot where you want the section-specific HTML to be inserted. (Don't worry, the `{{section}}` text will not be a part of the final output.)
5. Put all your custom section HTML files inside `/sections/`. The filename will be the URL, that is, `/sections/about.html` will be used to respond to a `GET /about`.
6. Place all your assets (images, stylesheets, scripts, whatevers) inside `/public/`. These will be available at the root of your site, that is, `/public/style.css` will be used to respond to a `GET /style.css`.
7. Add specific AppCache CACHE rules as one URL per line inside of `/cache.mf`. You can skip this as well.
8. Deploy. Release. Launch. Have a drink.
