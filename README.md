# Common Thread

**Shared memories, personal keepsakes.** Built for Shopping 3.0: the AI Commerce Hackathon with Arcade, October 11, 2026.

Live guest demo: https://common-thread-arcade.vercel.app/student

Photo keepsake examples: https://common-thread-arcade.vercel.app/examples

## What it does

An event organizer creates a shared pattern, chooses a product, and distributes a guest link or QR code. Each guest adds a personal motif, generates two variations, selects a real product, and continues to Arcade checkout.

The hosted prototype supports separate events, each with up to 30 guests. Guests do not need to provide a name or email address. Guest access is stored in the same browser; changing devices or clearing browser storage does not automatically restore it. Organizers can create an event without a password. A private organizer token is saved in the creating browser. Guest links contain only the event ID and do not grant organizer access. The original submitted demo keeps its existing access code. Changing browsers or clearing storage does not restore the organizer token automatically.

## How Arcade is used

- `categories/list` and `categories/get`: available products, materials, sizes and finishes.
- `patterns/create`, `jobs/get`, and `patterns/get`: generate the organizer's shared pattern.
- `patterns/refine/edit`: create two personal versions using the shared `patternId` and the guest's motif.
- `products/create` and `products/get`: build orderable products and retrieve actual previews and unit prices.
- `checkouts/create`: prepare a quantity-one checkout. The guest reviews the total and completes payment on Arcade.

Jobs and request IDs are persisted so a timeout can resume the existing request. Generation may take several minutes. The browser advances hosted jobs while the page is open; reopening the page resumes saved progress. Completed designs are not regenerated on refresh.

AI editing may alter details and layout; exact pixel preservation is not guaranteed. Unit prices exclude shipping, tax and service fees. Creating a checkout link or selecting a design does not place an order.

## Photo examples and current limits

The three photo scarves on `/examples` are real Arcade product examples. Arcade generated their backgrounds, this site combined each background with a stock group photo, and the finished artwork was **manually imported through Arcade Studio** before creating the products. Automatic import of an arbitrary finished photo composite is not connected in this prototype.

The live automated flow is shared-pattern generation and personal AI edits, rather than guaranteed preservation of a photograph. Product previews may also contain AI changes; inspect faces, text and artwork before purchasing.

## Run locally

Requires Node.js 24.

```sh
npm ci
cp .env.example .env.local
npm start
```

Open http://127.0.0.1:4317/teacher for the organizer and http://127.0.0.1:4317/student for the guest. Local links work on the same computer. The local organizer view is for development; the hosted organizer view has separate authentication.

Credentials are optional for exploring the UI, but actual generation requires server-side configuration:

- `ARCADE_API_KEY`: your Arcade API key.
- `ARCADE_CONTACT`: API client contact, used in the User-Agent.
- `ARCADE_ALLOW_GENERATION=true`: enable live API generation only after authorizing usage and costs.

Restart the server after editing environment variables. API keys never belong in browser code or version control.

## Hosted architecture

The frontend is plain JavaScript, HTML and CSS. The local server is Node.js. Vercel routes requests to `api/router.mjs`; hosted state is stored in a private Vercel Blob with conditional writes and retry handling. Organizer sessions use an HttpOnly, Secure, SameSite cookie. Guests receive only their own participant data.

Production additionally requires `BLOB_READ_WRITE_TOKEN`, `TEACHER_ACCESS_CODE`, and initialized event storage. `CLASS_BLOB_PATH` optionally specifies the private storage path. `scripts/setup-cloud.mjs` initializes an event from local configuration; review it before running against your account. The existing demonstration uses a single event, not a general multi-event platform.

## Validation

```sh
npm run check
npm test
```

Tests cover authorization, participant preference changes, generation locks, durable state, and checkout product/quantity/retry contracts. The hosted workflow was also tested with a real shared pattern and two personal cotton scarf products. Both returned a unit price of USD 19.41 for the tested specification; this is not a universal product price. No payment was made during validation.

The scripts named `verify-cloud*` require configured storage and should only be used in an authorized test environment. They are not part of the default test command.

## Photo credit

Group photo: [Green odette / Pexels](https://www.pexels.com/photo/high-school-students-group-photo-outdoors-32292152/), used under the [Pexels license](https://www.pexels.com/license/). The people pictured are stock-photo subjects, not actual service users.

Arcade documentation: https://docs.arcade.ai/quickstart
