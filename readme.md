# BetterUnsubscribe

#### A Modern Rewrite of [Unsubscribe](https://addons.thunderbird.net/en-us/thunderbird/addon/unsub/) by NilsKr33, Eicke Godehardt, and Andrej Korinth. Now with Additional Features!

BetterUnsubscribe enhances your email experience by simplifying the unsubscribe process. This extension adds a convenient button to your navigation bar, appearing whenever an unsubscribe option is detected in an email.

## Features

BetterUnsubscribe uses multiple methods to handle unsubscription, depending on the available options in the email:

1. **One-Click Unsubscribe**: If `List-Unsubscribe=One-Click` is found in the email header, a POST request is sent to unsubscribe.
2. **Unsubscribe via Email**: If a `List-Unsubscribe` email address (`mailto://`) is present in the header, an email draft is prepared for you to send.
3. **Unsubscribe via Web**: If a `List-Unsubscribe` web address (`https://`) is in the header, the site is opened in your browser.
4. **Unsubscribe Link in Content**: If an unsubscribe link (`https://`) is found within the email content, the site is opened in your browser.

## Download
The latest version can be found [here](https://github.com/LucBennett/BetterUnsubscribe/releases/latest).

## Build Instructions

1. **Navigate to the project directory**: In your terminal or command prompt, navigate to the directory where the project is located.
2. **Run the appropriate compile script** for your operating system to build the project. The script will generate `BetterUnsubscribe.xpi` in the `build` directory.
   - **Unix & macOS**: Run `compile.sh` (requires `/bin/sh`).
   - **Windows (with .NET)**: Run `compile.ps1` (requires PowerShell and .NET).
   - **Windows (with 7z/zip)**: Run `compile-z.ps1` (requires PowerShell and 7z or zip installed).

## Install

1. Open **Thunderbird**.
2. Go to **Menu** (hamburger icon) -> **Add-ons and Themes**.
3. Click on **Tools for Add-ons** (gear icon) -> **Install Add-on From File**.
4. Select `BetterUnsubscribe.xpi` from the `build` directory and add it to Thunderbird.

## Warning

Please be cautious when opening web links provided in emails. Phishing attempts are common, and opening malicious links can compromise your personal information and security. Always verify the legitimacy of the email sender before clicking on any links.

Additionally, [here](./Security%20Concerns.md) is a summary of some of the Security and Privacy concerns users should be aware of when using this (or any) unsubscribing tool.

### Translations

Brazilian Portuguese created by [dataserver](https://github.com/dataserver).

### Icon Credits

The icon is made by [freepik](https://www.freepik.com) and can be found on [FlatIcon](https://www.flaticon.com/free-icon/email_121931).