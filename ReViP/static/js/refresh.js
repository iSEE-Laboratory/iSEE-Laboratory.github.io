"use strict";

const header=document.getElementById('site-header');
const menuToggle=document.getElementById('menu-toggle');
const navigation=document.getElementById('site-nav');
function updateHeader(){header.classList.toggle('is-scrolled',window.scrollY>24);}
function closeMenu(){menuToggle.setAttribute('aria-expanded','false');navigation.classList.remove('is-open');header.classList.remove('menu-open');}
updateHeader();window.addEventListener('scroll',updateHeader,{passive:true});
menuToggle.addEventListener('click',()=>{const open=menuToggle.getAttribute('aria-expanded')!=='true';menuToggle.setAttribute('aria-expanded',String(open));navigation.classList.toggle('is-open',open);header.classList.toggle('menu-open',open);});
navigation.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menuToggle.getAttribute('aria-expanded')==='true'){closeMenu();menuToggle.focus();}});

function loadVideo(video) {
  let changed=false;
  video.querySelectorAll('source[data-src]').forEach(source=>{source.src=source.dataset.src;delete source.dataset.src;changed=true;});
  if(changed)video.load();
}
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const heroVideo=document.getElementById('hero-video');
const heroToggle=document.getElementById('hero-toggle');
function syncHeroPlayback(){const playing=!heroVideo.paused;heroToggle.textContent=playing?'Pause background Ⅱ':'Play background ▶';heroToggle.setAttribute('aria-label',playing?'Pause background video':'Play background video');}
heroVideo.addEventListener('playing',syncHeroPlayback);heroVideo.addEventListener('pause',syncHeroPlayback);
if(reducedMotion){heroVideo.removeAttribute('autoplay');heroVideo.pause();}
syncHeroPlayback();
heroToggle.addEventListener('click',()=>{if(heroVideo.paused){heroVideo.dataset.userPaused='false';heroVideo.play().catch(syncHeroPlayback);}else{heroVideo.dataset.userPaused='true';heroVideo.pause();}});
if('IntersectionObserver' in window) {
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(({target,isIntersecting})=>{
      if(isIntersecting){loadVideo(target);if(target.hasAttribute('data-observe-video')&&!reducedMotion&&target.dataset.userPaused!=='true')target.play().catch(()=>{});}
      else target.pause();
    });
  },{rootMargin:'120px',threshold:.12});
  document.querySelectorAll('video').forEach(video=>observer.observe(video));
} else document.querySelectorAll('video').forEach(loadVideo);

const dialog=document.getElementById('figure-dialog');let figureTrigger=null;
document.querySelectorAll('[data-zoom]').forEach(button=>button.addEventListener('click',()=>{
  const image=button.querySelector('img');figureTrigger=button;
  document.getElementById('expanded-figure').src=image.currentSrc||image.src;
  document.getElementById('expanded-figure').alt=image.alt;
  document.getElementById('figure-caption').textContent=image.alt;
  dialog.showModal();
}));
document.getElementById('close-figure').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
dialog.addEventListener('close',()=>figureTrigger?.focus());

document.getElementById('copy-citation').addEventListener('click',async()=>{
  const text=document.getElementById('bibtex').textContent;
  const status=document.getElementById('copy-status');
  try {await navigator.clipboard.writeText(text);status.textContent='BibTeX copied.';}
  catch {const range=document.createRange();range.selectNodeContents(document.getElementById('bibtex'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);status.textContent='Citation selected. Copy it using your keyboard.';}
});

async function renderResults() {
  const response=await fetch('./static/revip-data.json');if(!response.ok)throw new Error('Result data unavailable');
  const {methods}=await response.json();const body=document.querySelector('#fc-table tbody');
  const maxima=methods[0].values.map((_,i)=>Math.max(...methods.map(row=>row.values[i])));
  let previousFamily='';
  methods.forEach(method=>{
    const row=document.createElement('tr');
    if(method.ours)row.classList.add('ours-row');
    if(previousFamily&&previousFamily!==method.family)row.classList.add('group-start');
    previousFamily=method.family;
    const name=document.createElement('th');name.scope='row';name.textContent=method.name;row.append(name);
    method.values.forEach((value,i)=>{const cell=document.createElement('td');cell.textContent=`${value}%`;if(value===maxima[i]){cell.classList.add('best');cell.title='Best reported value in this comparison';}row.append(cell);});
    body.append(row);
  });
}
renderResults().catch(()=>{
  const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=11;
  cell.textContent='The result table could not be loaded. Please see Table IV in the manuscript.';row.append(cell);document.querySelector('#fc-table tbody').append(row);
});

if('IntersectionObserver' in window) {
  const links=[...document.querySelectorAll('.site-header nav a')];
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(entry.isIntersecting)links.forEach(link=>{if(link.hash===`#${entry.target.id}`)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
  }),{rootMargin:'-15% 0px -60% 0px',threshold:0});
  links.forEach(link=>{const section=document.querySelector(link.hash);if(section)observer.observe(section);});
}
