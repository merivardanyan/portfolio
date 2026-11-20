// Every personal detail on the site lives here. Edit this file, then run `npm run build:site`
// so the static HTML (no-JS visitors, crawlers, link previews) matches. With JS on, main.js
// applies these values at runtime too.
//
// Image slots: set a flag to true once the file exists in assets/images/ (see IMAGES_NEEDED.md).
// Until then the site uses CSS fallbacks and never requests a missing file.

export default {
  name: 'Meri Vardanyan',
  initials: 'MV',
  role: 'Senior full-stack developer',
  yearsExperience: '7+',
  location: 'Open to remote',
  email: 'ms.merivardanyan@gmail.com',
  github: 'https://github.com/merivardanyan',
  linkedin: 'https://www.linkedin.com/in/mvardanyan/',
  // Repository that contains this portfolio; project "Source" links point into it.
  repo: 'https://github.com/merivardanyan/portfolio',
  repoBranch: 'main',
  // Absolute URL of the deployed site (with trailing slash). Used for canonical, Open Graph, robots.txt,
  // sitemap.xml and the 404 page's base path. `npm run build -- --production` refuses the placeholder.
  siteUrl: 'https://merivardanyan.github.io/portfolio/',

  about: [
    'I build web apps end to end, from the database schema to the last focus ring. Most of my work is in React, Vue, Node.js and PHP, and I care most about the boring parts that make products feel solid: correct money math, honest loading states, keyboard support, and tests where they count.',
    'Every project on this page runs as a static demo, and most also ship a real backend you can run locally with one command.',
  ],
  lookingFor: 'Senior full-stack or frontend roles, open to remote',

  images: {
    hero: true, // assets/images/hero.webp (1920x1080)
    portrait: false, // assets/images/portrait.webp (not provided yet)
    covers: true, // assets/images/cover-<slug>.webp (1600x1000) for every project
  },
}
