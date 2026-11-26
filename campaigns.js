'use strict';

const albertaCampaigns = [
  {
    id: 'ab-fscd',
    title: 'Shorter FSCD wait times',
    summary: 'Help families get disability supports sooner.',
    subject: 'Reduce FSCD wait times in Alberta',
    body: 'Dear Minister,\n\nPlease publish regional wait times from an FSCD application to a child’s first service. What support can families get while they wait? Please set a target for reducing delays and tell families when you will report progress.\n\nThank you.'
  },
  {
    id: 'ab-halal-home-finance',
    title: 'Access to halal home financing',
    summary: 'Ask Alberta to review barriers for homebuyers seeking halal financing.',
    subject: 'Expand access to halal home financing in Alberta',
    body: 'Dear Minister,\n\nWe want Alberta families to have access to halal home financing. Please meet with homebuyers and lenders to identify provincial barriers to co-ownership and purchase-and-resale financing. What changes will Alberta consider, and how can buyers compare costs and protections?\n\nThank you.'
  },
  {
    id: 'ab-er',
    title: 'Emergency room waits and overcrowding',
    summary: 'Ask for a plan to reduce delays in Alberta hospitals.',
    subject: 'Reduce waits in Alberta emergency departments',
    body: 'Dear Minister,\n\nPlease publish a plan to shorten emergency room waits in Alberta. How will you reduce the time to first assessment and the time admitted patients wait for a hospital bed? Please share staffing and bed-capacity actions, timelines and progress by hospital.\n\nThank you.'
  }
];

function showCampaignList(message = '') {
  modal(`<h2>Alberta campaigns</h2>${message ? '<p>' + esc(message) + '</p>' : ''}
    <div class="choice-stack">${albertaCampaigns.map(c =>
      tile(esc(c.title), esc(c.summary), 'campaign-detail', 'mail', `data-value="${c.id}"`)).join('')}</div>
    ${flowBtn('Back to menu', 'menu', 'secondary small')}`);
}

async function campaignOffice(id) {
  if (window.CivicWeb?.campaignOffice && !window.CivicWeb.usingBundle?.()) {
    return window.CivicWeb.campaignOffice(id);
  }
  const response = await fetch('campaign-offices.json');
  if (!response.ok) throw Error('Could not load the campaign office.');
  return (await response.json())[id];
}

function campaignSocialLinks(url, text) {
  const address = encodeURIComponent(url);
  const platforms = [
    ['Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' + address],
    ['X', 'https://twitter.com/intent/tweet?url=' + address + '&text=' + encodeURIComponent(text)],
    ['LinkedIn', 'https://www.linkedin.com/sharing/share-offsite/?url=' + address],
    ['WhatsApp', 'https://wa.me/?text=' + encodeURIComponent(text + '\n' + url)]
  ];
  const target = window.MoneySnapshotAndroid ? '_self' : '_blank';
  return platforms.map(([name, href]) =>
    `<a class="button secondary small" aria-label="Share on ${name}" href="${esc(href)}" target="${target}" rel="noopener noreferrer">${name}</a>`
  ).join('');
}

async function showCampaign(id) {
  const campaign = albertaCampaigns.find(c => c.id === id);
  if (!campaign) return showCampaignList('This campaign link is unavailable. Choose an Alberta campaign below.');

  const postURL = 'https://civicpost.ca/' + id + '.html';
  const invitation = campaign.summary + ' Open the campaign to review and personalize an email to the Alberta government.';
  const post = invitation + '\n' + postURL;
  modal(`<h2>${esc(campaign.title)}</h2>
    <p>${esc(campaign.summary)}</p>
    <nav aria-label="Share this campaign">
      <h3>Share this campaign</h3>
      <div class="row">${campaignSocialLinks(postURL, campaign.summary)}</div>
    </nav>
    <p><a href="${postURL}">Campaign page</a> · <button class="text-button" data-copy-campaign>Copy page link</button></p>
    <div class="row">
      ${navigator.share ? '<button class="button secondary small" data-share-post>Share campaign post</button>' : ''}
      <button class="button secondary small" data-copy-post>Copy campaign post</button>
    </div>
    <div id="campaign-compose" aria-live="polite">Loading the recipient…</div>
    <p><strong>Subject</strong><br>${esc(campaign.subject)}</p>
    <div class="campaign-message">${esc(campaign.body)}</div>
    <div id="campaign-qr"></div>
    ${flowBtn('All Alberta campaigns', 'campaigns', 'secondary small')}`);
  const compose = $('#campaign-compose');
  const qr = $('#campaign-qr');
  const active = () => compose.isConnected && $('#dialog').open;
  $('[data-copy-campaign]').onclick = () => copyText(postURL);
  $('[data-copy-post]').onclick = () => copyText(post);
  const sharePost = $('[data-share-post]');
  if (sharePost) sharePost.onclick = async () => {
    try {
      await navigator.share({text: invitation, url: postURL});
    } catch (error) {
      if (error.name !== 'AbortError') toast('Sharing is unavailable. Choose Copy campaign post and paste it into your social app.');
    }
  };

  try {
    const office = await campaignOffice(id);
    if (!active()) return;
    if (!office || !E.emailValid(office.email)) throw Error('The campaign recipient is unavailable.');
    const mail = E.addressedMailto([office.email], [], campaign.subject, campaign.body.replace(/\n/g, '\r\n'));
    compose.innerHTML = `<p><strong>To</strong> · ${esc(office.role)}<br>${esc(office.email)}
      · <a href="${esc(E.safeURL(office.source))}" target="_blank" rel="noopener noreferrer">Source</a></p>
      <a class="button" href="${esc(mail)}">Open email draft</a>
      <button class="button secondary small" data-copy-email>Copy email link</button>
      <p class="small">You can edit the draft in your email app before sending.</p>`;
    compose.querySelector('[data-copy-email]').onclick = () => copyText(mail);
    qr.innerHTML = '<h3>Email QR code</h3><p class="small">Scan to open the same addressed draft in your email app.</p><div id="draft-qr-stage" class="qr-stage"></div><p id="qr-size-note" class="small muted" role="status">Preparing QR code…</p>';
    if (!window.MoneySnapshotAndroid) qr.insertAdjacentHTML('beforeend', button('Download QR image', 'qr-image', 'secondary small'));
    await loadQRTools();
    if (active()) renderShareQR(mail, campaign.title + ' email QR code', 'CivicPost_' + id + '.png', postURL);
  } catch (error) {
    if (!active()) return;
    if (compose.querySelector('a[href^="mailto:"]')) {
      qr.textContent = 'The QR image could not load. You can still use the email or page link.';
    } else {
      compose.innerHTML = `<p>${esc(error.message || 'Could not load the campaign recipient.')}</p>
        ${flowBtn('Retry recipient lookup', 'campaign-detail', 'secondary small', `data-value="${id}"`)}`;
    }
  }
}

function openCampaignFragment() {
  if (location.hash.startsWith('#campaign=')) {
    showCampaign(location.hash.slice('#campaign='.length));
  } else if (!location.hash) {
    const id = document.querySelector('meta[name="civicpost-campaign"]')?.content || new URLSearchParams(location.search).get('campaign');
    if (id) showCampaign(id);
  }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = albertaCampaigns;
} else {
  window.addEventListener('hashchange', openCampaignFragment);
  openCampaignFragment();
}
