# MetaArc

MetaArc is a creative client modified from Reveric, plus an account portal that is still incomplete. It supports Windows, macOS, and Android.

[简体中文](README.md)

## Client

The desktop and mobile clients keep the upstream local-first workspace. Novels, screenplays, the canvas, the director stage, and the editor run on device, and works are stored in local SQLite. Models come from providers configured by the user. Those creative tools come from Reveric. They are not a MetaArc-hosted compute service.

## Portal and accounts

`server/metaarc/` serves the portal and account API, including registration, login, and `GET /api/plans`. The pricing section renders only what that endpoint returns. If the request fails, the page does not show prices.

No payment channel is connected. Purchase and top-up controls stay disabled, and the page does not report a successful payment.

Registration creates a portal account only. The mobile client has no account entry, so a successful registration does not turn on mobile sync. When the compute channel does not return a usable credential, the interface does not present one as issued.

The admin configuration pane does not probe integrations and does not show an "integrated" status.

## Downloads

MetaArc does not publish its own installers. The portal download section says the clients are not released yet and does not link to upstream release files.

## Run locally

From the repository root:

```bash
make deps
make codegen
make run-macos
```

On Windows, use `make run-windows`. See `server/metaarc/README.md` for the account service.

## Attribution and license

This repository is a modified version of Reveric. The author attribution is looplj. The client About page keeps the sentence “Based on Reveric by looplj.”

The license is [GNU AGPLv3](./LICENSE). Additional terms and third-party notices are in [NOTICES](./NOTICES).
