# SUMI APP — Staging acceptance

## Current state

- V2 order, notification, school-lockdown, delivery and KPI flags are enabled only on staging.
- The first staging registration becomes the bootstrap owner.
- Every later registration remains pending until management approval.
- New phone accounts use the valid `@phone.sumibakery.app` alias; login keeps a fallback for legacy `@phone.sumibakery.internal` accounts.
- Production cutover is a separate operation and requires explicit approval.
- V2 state changes are mirrored to the legacy status so old and new screens remain consistent during migration.

## Acceptance roles

Create one staging account for each role: business director, cashier/order creator,
kitchen lead, kitchen employee and driver. Do not reuse production credentials.

## End-to-end order scenario

1. Cashier creates one order with two product lines and reference images.
2. Business director splits the order between Hot Kitchen and Cold Kitchen.
3. Each kitchen lead accepts its package and assigns tasks to employees.
4. Employees start and complete their assigned tasks with production evidence.
5. Kitchen leads approve completion. The order becomes ready only after every required package is complete.
6. Dispatcher assigns the ready order to a driver.
7. Driver accepts and starts the run with location, then completes delivery with photo and recipient.
8. Verify the order timeline, notifications, sound cues and KPI evidence.

## Restricted school-order scenario

- Only the business director and assigned Factory 42 kitchen lead may see the order.
- No price, revenue or financial field may appear in lists, details, notifications or exports.
- Other roles must receive no row and no indirect identifying information.

## Media lifecycle

- Reference, production and delivery images remain in operational storage for seven days.
- The backup Edge Function must report a Google Drive object ID before purge is allowed.
- Google Drive credentials still need to be configured in staging secrets before this case can pass.
