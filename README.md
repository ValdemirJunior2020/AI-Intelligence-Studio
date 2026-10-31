# THEUX DESIGN — AI Intelligence Studio

A dark-purple, local-first AI workspace built with React, Node.js and Ollama. Designed for Windows and AMD GPUs, with the React frontend ready for Netlify. No NVIDIA card and no ComfyUI required.

## QUICK START (Windows)

1. Open GitHub: https://github.com/ValdemirJunior2020/AI-Intelligence-Studio
2. Click Code, then Download ZIP (or clone the repository with Git).
3. Extract the project to a folder on a disk with free space.
4. Double-click THEUX-AI.bat.
5. The installer checks Node.js, Git, Ollama and npm dependencies, preserves an existing local .env, optionally pulls a 7B model if none is installed, and starts the backend and frontend.
6. Open http://127.0.0.1:5173 and create the first SUPER ADMIN (password 12+ characters).

BACKEND: http://127.0.0.1:4317/api/health
FRONTEND DEV: http://127.0.0.1:5173

If Node, Git or Ollama was just installed, Windows may need a new terminal for PATH to refresh. Rerun the BAT. Existing model folders are never deleted.

## WHAT WORKS IN THE APP

- Local AI chat with installed Ollama models.
- Two-model comparison arena (runs models against the same prompt).
- Developer, website planning, research-on-supplied-material, QA, prompt and marketing assistants.
- Private per-user document upload for extractable PDF, TXT, Markdown, CSV, JSON and LOG, and document Q&A with keyword-matched snippets.
- Basic Latin-character PDF export.
- Queued, stoppable and retryable 3-step AI missions, with saved results and logs.
- Secure first-run super-admin setup, member creation and account separation.
- MiniMax H3 text-to-video submit and status checking (PAID API integration, not local generation). An explicit cost authorization is required on each new job.
- Premium responsive dark-purple Theux Design UI, settings and Netlify build.
- A catalog of open-source projects that can be integrated separately.

The hub has 12 built-in tool experiences powered by the backend, plus external repository references. These are not 12 independently trained AI models or 40 self-hosted programs.

## WHAT IS NOT YET INSTALLED

Projects shown as EXTERNAL are links and descriptions only, not installed services. This separation is deliberate: large GitHub applications can require separate databases, Docker containers, GPU stacks and license obligations. Do not assume every catalog tile is a functioning external integration.

Five additional repositories selected from the supplied JSX collection:
1. OpenHands — https://github.com/OpenHands/OpenHands — autonomous software development (external).
2. n8n — https://github.com/n8n-io/n8n — visual workflow platform, fair-code terms (external).
3. Stirling PDF — https://github.com/Stirling-Tools/Stirling-PDF — advanced PDF processing (external).
4. Playwright — https://github.com/microsoft/playwright — browser automation / QA testing (external).
5. Chatterbox — https://github.com/resemble-ai/chatterbox — speech synthesis (external).

The catalog also references Unstract, DocETL, Morphic, Moonshine, pdfme, Puck, assistant-ui, OpnForm, LitServe, next-forge, Open WebUI, Langflow, Crawl4AI, Penpot and more. Integrating their code requires more than copying repositories, and redistributing them may impose licensing obligations.

## NETLIFY FRONTEND

This repository has netlify.toml. Connect the repository in Netlify:
- Build command: npm run build
- Publish directory: dist
- Node version: 22

The frontend is static. Netlify DOES NOT run Ollama or the Node backend for you. The backend must be running on the Windows PC or a suitable server.

For worldwide remote access, use a secured HTTPS reverse proxy or tunnel to the backend. Set the backend .env CORS_ORIGIN to your exact Netlify origin. Set the Netlify build environment VITE_API_URL to your secured HTTPS backend address, or supply the address on the login screen.

Example local backend .env:
HOST=127.0.0.1
PORT=4317
OLLAMA_URL=http://127.0.0.1:11434
CORS_ORIGIN=https://yourname.netlify.app,http://localhost:5173
AIHUB_DATA_DIR=D:\THEUX_AI_DATA
MINIMAX_API_KEY=

IMPORTANT: Do not put secret keys into VITE_ variables. Never expose Ollama port 11434 to the open internet. Create the super-admin account locally BEFORE opening remote access. Public hosting requires extra authentication, rate limiting, monitoring, and security audits before selling subscriptions.

## MINIMAX H3 VIDEO

Video Creator uses the official MiniMax H3 V2 endpoints:
POST https://api.minimax.io/v2/video_generation
GET https://api.minimax.io/v2/query/video_generation/{task_id}
See https://github.com/MiniMax-AI/cli

This is a hosted PAID model. It does not run on the AMD GPU and uses no ComfyUI. Configure a funded MINIMAX_API_KEY in the local backend .env. The app will refuse to send paid jobs without a checkbox.

As of October 2026, MiniMax lists H3 at $0.13 per second for 2K output. Example: 5 seconds costs about $0.65 in output charges, excluding any input media and related charges. Pricing can change. The code uses text-only prompts; additional image/video input is not included yet.

## DISK SPACE ESTIMATES

- Project source and npm dependencies: approximately 0.2–0.8 GB.
- Ollama application and runtime: approximately 0.5–1.5 GB.
- One quantized 7B local model: approximately 4–6 GB.
- Two 7B–9B quantized models: approximately 9–14 GB total.
- Documents: depends on uploaded files and extracted text.
- MiniMax H3: 0 GB local model weights because generation happens on MiniMax servers; saved video files take space.
- External projects: highly variable, from small libraries to tens/hundreds of GB if installed with GPU models.

Allow at least 20 GB of free space for the first installation. A 1 TB SSD is a practical expansion target; reserve 100–200 GB if you want many future models and integrations. These numbers are planning estimates, not a measured installation.

To move application data to your new SSD, set AIHUB_DATA_DIR in .env before launch. To move Ollama model weights, follow the official instructions for the OLLAMA_MODELS Windows environment variable; stop Ollama and verify the new path before removing old files.

## DEVELOPER COMMANDS

npm install
npm run server
npm run dev
npm run check
npm run test
npm run build

Run npm run server and npm run dev in separate terminals. Requires Node.js 22+.

## SECURITY / PRODUCT LIMITATIONS

- Backend binds to 127.0.0.1 by default, passwords are hashed with scrypt, and 12-hour bearer sessions are kept in memory. This is a small-team starter architecture, not enterprise SSO.
- App data persists in a JSON file under data/ or AIHUB_DATA_DIR. Protect the directory and back it up.
- Document Q&A uses keyword chunks, NOT vector retrieval, full OCR, or verified page-level citations. PDF extraction only works when text is embedded and readable.
- The AI coding assistant drafts code in text. It does NOT execute arbitrary code, run browser tests, or push a generated app automatically.
- Research only analyzes supplied content by default; a real-time web crawler is a separate optional integration.
- External open-source apps have their OWN licenses and installation needs; Unstract (AGPL) and n8n (fair-code) particularly merit review before commercial use.
- MiniMax output and billing cannot be tested without an API key. AMD acceleration cannot be verified without a Windows machine.
- Code is supplied as an extensible first release; the app is not a production-complete commercial SaaS.

## LICENSE

The original Theux integration code in this repository is MIT licensed (see LICENSE). Third-party repositories retain their own licenses.
