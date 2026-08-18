# Radar Hosting Setup

## Startup
Startup command:
```
npm start
```

## Environment variable
Add this variable in Radar:
- `DISCORD_TOKEN` — your Discord bot token

## Recommended runtime
- Node.js 22
- Install command: `npm ci --omit=dev`
- Startup command: `npm start`

If Radar does not support `npm ci`, use:
```
npm install
```

## Persistent data
The bot stores its SQLite database at:
`data/platform.sqlite`

If Radar provides persistent volumes/storage, mount or persist the `data` folder so bot configuration and records survive redeploys or container recreation.
