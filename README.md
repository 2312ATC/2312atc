# 2312 (Tavistock) Squadron Air Cadets

Public website for [2312 Squadron](https://tavistock.air-cadets.org/), part of the Royal Air Force Air Cadets. It covers squadron information, events, news, and how to join.

Built with [Astro](https://astro.build/) 6, Tailwind CSS 4, and [Decap CMS](https://decapcms.org/). Content is committed to this repository and the site is deployed to GitHub Pages.

## Requirements

- Node.js 22.12 or later
- [pnpm](https://pnpm.io/) 9 (`packageManager` in `package.json` pins 9.15.4)

## Local development

```sh
pnpm install
pnpm dev
```

The dev server listens on all interfaces at [http://localhost:4321](http://localhost:4321).

| Command | Action |
| :------ | :----- |
| `pnpm dev` | Start the local server |
| `pnpm build` | Build the production site into `./dist/` |
| `pnpm preview` | Serve the production build locally |
| `pnpm astro ...` | Run Astro CLI commands (`astro check`, `astro add`, and so on) |

## Editing content

Editors use Decap CMS at `/admin` (production: [https://tavistock.air-cadets.org/admin](https://tavistock.air-cadets.org/admin)). Sign-in goes through the GitHub backend configured in `public/admin/config.yml`, using [https://decap.tavistock.air-cadets.org](https://decap.tavistock.air-cadets.org). Saves are commits on `main` of `2312ATC/2312atc`, which triggers a deploy.

The same content can be edited as files:

| Collection | Location | Used on |
| :--------- | :------- | :------ |
| News posts | `src/content/blog/` | Home, News, RSS |
| Events | `src/content/events/` | Home, Events |
| Notifications | `src/content/notifications/` | Banner and panel |
| Home carousel | `src/content/landingCarousel.json` | Home |
| Staff | `src/content/staff.json` | About |
| What we offer | `src/content/offers.json` | About |
| Activities | `src/content/activities.json` | What We Do |
| Opportunities | `src/content/opportunities.json` | Cadets |
| Useful links | `src/content/cadetLinks.json` | Cadets |
| FAQs | `src/content/faq.json` | Join Us |

Images uploaded through the CMS land in `src/assets/images`. News and event dates shown on the site come from git history, so a full clone (`git fetch --unshallow` if needed) matters for local builds that should match production.

Squadron name, address, parade nights, and contact email live in `src/consts.ts`.

## Pages

| Path | Page |
| :--- | :--- |
| `/` | Home |
| `/about` | About the squadron |
| `/whatWeDo` | Activities |
| `/cadets` | Cadet information and links |
| `/events` | Event calendar and list |
| `/blog/page/1` | News |
| `/joinUs` | How to join (`/join` redirects here) |
| `/contact` | Contact |
| `/rss.xml` | News feed |
| `/admin` | Decap CMS |

JSON endpoints used by the home page and calendar (not cached, so they stay current between deploys):

- `/api/notifications.json`
- `/api/events/upcoming.json`
- `/api/events/{year}/{month}.json`

## Project structure

```text
public/admin/config.yml   Decap CMS collections
src/consts.ts             Squadron details
src/content/              Markdown and JSON content
src/content.config.ts     Content collection schemas
src/components/           Shared UI
src/layouts/              Page and blog layouts
src/lib/                  JSON-LD, notifications, git dates, cache headers
src/pages/                Routes
astro.config.mjs          Site URL, sitemap, Tailwind
```

`/admin` and `/blog` are omitted from the sitemap. Blog posts are still linked from the news index.

## Deployment

Pushes to `main` run `.github/workflows/deploy.yml`. The workflow checks out full git history (for sitemap `lastmod` and published dates), builds with the official Astro GitHub Action, and deploys to GitHub Pages. The live site is [https://tavistock.air-cadets.org/](https://tavistock.air-cadets.org/).

`PUBLIC_BUILD_ID` is set to the commit SHA during that build so the home page, calendar, and notifications can tell one deploy from the next.

## Preview gate

Set `PUBLIC_PREVIEW_GATE=true` when building a draft that should sit behind the password screen in `src/components/PreviewPasswordGate.astro`. The component is left out of the bundle when the flag is unset, which is how production is built.
