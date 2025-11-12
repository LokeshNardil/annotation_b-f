# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/b1740ded-b673-435c-bfcf-9d8ffedba0f9

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/b1740ded-b673-435c-bfcf-9d8ffedba0f9) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/b1740ded-b673-435c-bfcf-9d8ffedba0f9) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Realtime backend integration

- Enable the live sync bridge by adding a `.env` file with
  ```
  VITE_REALTIME_ENABLED=true
  VITE_REALTIME_WS_URL=ws://localhost:8000
  VITE_REALTIME_PROJECT_ID=<project id>
  VITE_REALTIME_TOKEN=<jwt token>
  ```
- When the app loads, the annotator will connect to `/ws/projects/{projectId}`, request `annotation:list` for every profile viewport on screen, and merge the returned rectangles into the local store.
- Remote selections and cursors appear as colored overlays for other collaborators; your own pointer/selection is ignored so it won't duplicate the local highlight.
- Append `?projectId=...&token=...` to the browser URL to override the defaults during manual testing.