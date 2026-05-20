# GitHub Setup

This guide helps move this project to GitHub and open it on another computer.

## Project path

```powershell
C:\Users\LMATS Consulting\Documents\Codex\2026-05-20\create-a-lightweight-internal-web-application
```

## 1. Install Git and GitHub CLI

Use `winget`:

```powershell
winget install --id Git.Git -e
winget install --id GitHub.cli -e
```

If `winget` is unavailable, use Chocolatey:

```powershell
choco install git github-cli -y
```

Restart PowerShell after installation, then verify:

```powershell
git --version
gh --version
```

## 2. Authenticate GitHub CLI

```powershell
gh auth login
```

Recommended choices:

- GitHub.com
- HTTPS
- Login with browser

## 3. Create a new GitHub repository

From the project folder:

```powershell
cd "C:\Users\LMATS Consulting\Documents\Codex\2026-05-20\create-a-lightweight-internal-web-application"
git init
git add .
git commit -m "Initial tax firm operating system prototype"
git branch -M main
gh repo create YOUR-REPO-NAME --private --source . --remote origin --push
```

If you prefer to create the repo manually on GitHub first, use:

```powershell
cd "C:\Users\LMATS Consulting\Documents\Codex\2026-05-20\create-a-lightweight-internal-web-application"
git init
git add .
git commit -m "Initial tax firm operating system prototype"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
git push -u origin main
```

## 4. Open on another computer

Install Git there too, then clone:

```powershell
git clone https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
cd YOUR-REPO-NAME
```

## 5. Install project dependencies on the other computer

From the cloned folder:

```powershell
npm install
```

## 6. Configure environment variables

Copy the example env file:

```powershell
Copy-Item .env.example .env.local
```

Then fill in:

- Supabase values
- attendance automation values
- any other deployment secrets

## 7. Run locally

```powershell
npm run dev
```

## 8. Attendance setup reminder

The attendance feature still needs:

- `ATTENDANCE_SECRET_KEY`
- selectors for the first login layer
- selectors for the second attendance password layer
- a success selector after submission

These are defined in `.env.example`.

## 9. Suggested next push workflow

After changes:

```powershell
git add .
git commit -m "Describe your change"
git push
```
