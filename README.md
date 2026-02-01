# Turbo Kart Beta (Vite + React)

This project hosts the legacy Turbo Kart game inside a React app via an iframe.

## Setup

1. Copy the original game files into public/legacy so that public/legacy/index.html exists.
	 - Expected structure example:
		 - public/legacy/index.html
		 - public/legacy/css/styles.css
		 - public/legacy/js/
2. Start the dev server (npm run dev).

## Notes

- The React app renders an iframe that points to /legacy/index.html.
- You can later migrate the legacy scripts into src/ and replace the iframe when ready.
