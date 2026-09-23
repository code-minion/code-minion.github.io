# NONPROD Pages handoff (do not change prod publish)

Status: **blocked on Site Engineer**. No nonprod URL exists yet.
This change is documentation only. It does not add a workflow under `.github/workflows/`, does not deploy, and does not touch `master`.

## What publishes production today

| Item | Value |
| --- | --- |
| Repo | `code-minion/code-minion.github.io` |
| Live URL | https://code-minion.github.io/ |
| Custom domain | none (`Pages.cname` is null, no `CNAME` file, HTTPS enforced) |
| Source | GitHub Actions (`build_type: workflow`), not a branch of static files |
| Workflow | `.github/workflows/pages.yml` (`Deploy GitHub Pages`) |
| Triggers | `push` to `master`, plus `workflow_dispatch` |
| Build | Node 24, `npm ci`, `npm run build` (Vite), artifact path `dist` |
| Deploy | `actions/upload-pages-artifact@v3` then `actions/deploy-pages@v4` |
| Environment | `github-pages` |
| Who may deploy | deployment branch policy allows **`master` only** |
| Concurrency | group `pages`, `cancel-in-progress: true` (a second deploy cancels the one in flight) |
| Vite `base` | `./` (relative asset URLs) |
| Inspected SHA | `c74781ed481488c3668cb0f7fd04b3e2ce243727` (`master`) |

`code-minion/code-minion.github.io-private` is not visible to this token (API 404). Publishing above is entirely explained by this repo's workflow and the Pages API.

## Why this repo cannot host nonprod safely

Checked in order:

1. **No unused preview path.** There is no `gh-pages` branch, no `CNAME`, no preview workflow, and no hosted preview directory. `npm run preview` is local Vite only. Open branches (`cursor/uat-layout-fixes-4757`, `cursor/region-agnostic-architect-demo-6ce3`) use the same prod `pages.yml` and are not a second site.
2. **Actions does not build previews.** The workflow does not run on `pull_request`. `actions/deploy-pages` `preview: true` is still an internal alpha and is not available for this public repo. Do not turn it on.
3. **One Pages site per repo, and deploys replace it.** `actions/deploy-pages` publishes the whole `dist` artifact to this user site. A `/nonprod/` folder inside that artifact would still replace the production deployment. The next `master` deploy would also wipe any extra path.
4. **Do not widen the `github-pages` branch policy.** `workflow_dispatch` selects a ref, but only `master` may deploy. Allowing other branches would let a non-prod SHA overwrite https://code-minion.github.io/.

## URL that will exist

After the steps below, nonprod will be a **project site**, separate from the user site:

**https://code-minion.github.io/site-nonprod/**

That path is served by repo `code-minion/site-nonprod`. It does not replace files on the user site. Do not attach a custom domain.

## Exact change for Site Engineer

Do this in a **new** repository. Do not copy the workflow into `code-minion/code-minion.github.io`.

1. Create public repo `code-minion/site-nonprod`. Description: `NONPROD static preview of code-minion.github.io. Not production.`
2. Put this frontend in that repo (same build). Keep `vite.config.js` `base: './'`. Do not set `base` to `/` or assets will be requested from the user-site root.
3. Add `docs/platform/site-nonprod.workflow.yml` from this branch as `.github/workflows/pages.yml` in **`site-nonprod` only**.
4. Enable Pages with Actions as the source (no branch source, no custom domain):

   ```bash
   gh api --method POST /repos/code-minion/site-nonprod/pages -f build_type=workflow
   ```

   If the API says Pages must be enabled in settings first, set Source to **GitHub Actions** in the repo Pages settings and do not enter a custom domain.
5. Push the default branch so the workflow runs. Confirm the deployment environment is `github-pages` **on `site-nonprod`**, and set that environment's deployment branch policy to the default branch only.
6. Confirm https://code-minion.github.io/ still serves the user site, then open https://code-minion.github.io/site-nonprod/.

## Env and config names

Same names, different repo. Nothing here changes production DNS or the user-site environment.

| Name | Production (`code-minion.github.io`) | Nonprod (`site-nonprod`) |
| --- | --- | --- |
| Pages URL | https://code-minion.github.io/ | https://code-minion.github.io/site-nonprod/ |
| Workflow file | `.github/workflows/pages.yml` | `.github/workflows/pages.yml` in the other repo |
| Workflow name | `Deploy GitHub Pages` | `Deploy nonprod GitHub Pages` |
| Concurrency group | `pages` | `pages-nonprod` |
| Environment | `github-pages` (this repo, branch `master` only) | `github-pages` (other repo only) |
| `VITE_BFF_CHAT_URL` | unset; code falls back to `https://llm-bff-psi.vercel.app/api/chat` | unset unless Site Engineer sets a repository variable |
| `VITE_BFF_HIGHSCORE_URL` | unset; code falls back to `https://llm-bff-psi.vercel.app/api/game-highscore` | unset unless Site Engineer sets a repository variable |
| Turnstile site key | hardcoded `0x4AAAAAAC0uqHgTVbTJsHiU` | same build; hostname stays `code-minion.github.io` |
| Custom domain | none | none |

Chat and high-score posts from the nonprod site still hit the **production** BFF until `VITE_BFF_CHAT_URL` and `VITE_BFF_HIGHSCORE_URL` are set on `site-nonprod` (Actions repository variables, injected by the proposed workflow). There is no nonprod BFF URL in this repo. Leave the variables unset only if that production side effect is acceptable.

## Do not

- Force-push `master`.
- Edit or delete the user-site workflow, artifact, or Pages source.
- Add a `CNAME` or change DNS.
- Add a branch other than `master` to this repo's `github-pages` deployment policy.
- Deploy previews into this repo's Pages artifact.
