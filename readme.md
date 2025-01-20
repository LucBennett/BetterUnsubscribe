# BetterUnsubscribe

#### A Modern Rewrite of [Unsubscribe](https://addons.thunderbird.net/en-us/thunderbird/addon/unsub/) by NilsKr33, Eicke Godehardt, and Andrej Korinth, Now with Enhanced Features

BetterUnsubscribe improves your email experience by streamlining the unsubscribe process. This extension adds a button to your navigation bar, which appears whenever an unsubscribe option is detected within an email.

## Features

BetterUnsubscribe offers several unsubscription methods based on what is available in the email:

1. **One-Click Unsubscribe** _(RFC 8058)_: If a `List-Unsubscribe=One-Click` header is detected, a POST request is sent to unsubscribe you.
2. **Unsubscribe via Email** _(RFC 2369)_: If a `List-Unsubscribe` email address (`mailto://`) is found in the header, a draft email is prepared for you to send.
3. **Unsubscribe via Web** _(RFC 2369)_: If a `List-Unsubscribe` web link (`https://`) is provided in the header, the site is opened in your browser.
4. **Unsubscribe Link in Email Content**: If an unsubscribe link (`https://`) is embedded in the email content, the site is opened in your browser.

## Download

You can download the latest version of BetterUnsubscribe [here](https://github.com/LucBennett/BetterUnsubscribe/releases/latest).

## Build Instructions

1. **Navigate to the project directory**: Open your terminal or command prompt and navigate to the project folder.
2. **Run the appropriate compile script** for your operating system to build the project. This will generate the `BetterUnsubscribe.xpi` file in the `build` directory.
   - **Node.js**: Run `node compile.js` (requires node.js)
   - **Unix & macOS**: Run `compile.sh` (requires `/bin/sh` and 7z or zip installed).
   - **Windows (with .NET)**: Run `compile.ps1` (requires PowerShell and .NET).
   - **Windows (with 7z/zip)**: Run `compile-z.ps1` (requires PowerShell and 7z or zip installed).

You can also compile the project using:

```bash
npm run compile
```

## Installation Instructions

1. Open **Thunderbird**.
2. Navigate to **Menu** (hamburger icon) -> **Add-ons and Themes**.
3. Click **Tools for Add-ons** (gear icon) -> **Install Add-on From File**.
4. Select the `BetterUnsubscribe.xpi` file to install it.

## Development Workflow

To ensure a consistent development workflow, use the following tools and commands:

### Prettier (Code Formatter)

To format the codebase, run:

```bash
npm run format
```

### ESLint (Code Linter)

To lint the codebase for potential issues, run:

```bash
npm run lint
```

### Compiling

To compile the project, run:

```bash
npm run compile
```

## Warning

Please exercise caution when clicking web links provided in emails. Phishing attacks are common, and malicious links can compromise your security and privacy. Always verify the legitimacy of the sender before interacting with any email links.

A summary of potential security and privacy risks associated with unsubscribe tools can be found [here](./Security%20Concerns.md).

## Running Tests

Automated tests are provided to ensure BetterUnsubscribe works as expected. To run the tests, follow these steps:

1. **Install dependencies**: In the project directory, run:

   ```bash
   npm install
   ```

   This will install the necessary packages defined in `package.json`.

2. **Run the tests**: Once the dependencies are installed, run the following command to execute the test suite:

   ```bash
   npm run test
   ```

   This will test the functionality of BetterUnsubscribe and give feedback on any issues.

Remember to run the tests after making changes to ensure everything functions as intended.

## Todo

- [ ] Table view for unsubscribe links
- [ ] Support for other languages when detecting embedded links

## Translations

A Brazilian Portuguese translation was contributed by [dataserver](https://github.com/dataserver).

## Icon Credits

The icon was created by [freepik](https://www.freepik.com) and is available on [FlatIcon](https://www.flaticon.com/free-icon/email_121931).
