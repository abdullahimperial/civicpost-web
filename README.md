# CivicPost public website

Generated deployment repository for CivicPost Canada, by Abdullah Mohiuddin.

Development, source data, tests and release instructions belong in the private
[civicpost repository](https://github.com/abdullahimperial/civicpost).
Make changes there; do not hand-edit this generated website.

Release: `7c5b3ce17a285a534619`. Source commit: `56b72ffb3a6ff232da12b750b91acca67de529bf`.
See [release.json](release.json) for data dates and initial download measurements.
These are dated public records, not a guarantee that an officeholder is current.

## Hosting

In Settings → Pages, choose GitHub Actions. Leave Custom domain blank until
a domain is selected. The Publish CivicPost website action reports the actual
website address. Relative links support project paths and future custom domains.

Only a deliberate release from the development repository updates these files.
No signing keys, private research archives, user drafts, contact directory or
development history are part of this deployment. Office contacts are supplied
through bounded online API lookups with source links and expiry checks.

## Rollback

Restore the complete tree from a previously good deployment commit in a new
commit (including data, release.json and sw.js), then push main. Do not reset or
force-push history. Close old website tabs and reopen to activate its matching
service worker. The source repository's docs/WEB_RELEASE.md explains the process.

## Remaining owner setup

Choose a monitored support email before promoting this preview widely. The
domain and any advertising configuration are separate later decisions. This
website has no ads. Cloudflare Web Analytics measures visits and page performance;
see privacy.html and release.json for the current configuration. It does not
count confirmed email sends or identify unique people.
