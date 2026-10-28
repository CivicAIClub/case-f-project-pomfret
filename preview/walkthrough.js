/* An introduction only: no student data, sorting, settings or exports. */
(function () {
  'use strict';
  var dialog = document.getElementById('walkthrough-dialog');
  var trigger = document.getElementById('open-walkthrough');
  var step = 0;
  var returnFocus = null;
  var steps = [
    {
      label: 'What this is for',
      title: 'Choose projects, then place students',
      body: 'Use student interest to choose which projects to offer. Then make a draft schedule for Mr. Litowitz to review.',
      content: '<div class="tour-flow"><div><span class="tour-flow-number">1</span><p><strong>Choose projects</strong><span>What should we offer?</span></p></div><div><span class="tour-flow-number">2</span><p><strong>Place students</strong><span>Who joins each project?</span></p></div></div>',
      note: 'The sidebar has one screen for each task. These five steps explain how to use both.'
    },
    {
      label: 'Choose projects',
      title: 'See which projects students chose',
      body: 'Students could check several projects without ranking them. Use the menu beside each project to keep the suggestion or change it to a Major, a Minor or Do not run, where allowed.',
      content: '<div class="tour-schedule"><div class="tour-week-labels"><span></span><span>Week 1</span><span>Week 2</span></div><div class="tour-week-row"><strong>Major</strong><span class="tour-major">Same project, same group</span></div><div class="tour-week-row"><strong>Minor</strong><span>First project</span><span>Different project</span></div></div>',
      note: 'Only some projects can run as either a Major or a Minor. Mr. Litowitz checks teacher availability and confirms the list.'
    },
    {
      label: 'Create placements',
      title: 'Create the first draft',
      body: 'Open Place students and click Create draft placements. The app uses your project choices and rules to make a schedule for both weeks.',
      content: '<dl class="tour-explainer"><div><dt>How it matches</dt><dd>It uses project choices, Types and UN goals, within the group limits.</dd></div><div><dt>Missing details</dt><dd>Students whose records need fixing stay on the review list.</dd></div><div><dt>After a change</dt><dd>Update placements and add a short reason for changing a project or rule.</dd></div></dl>',
      note: 'Next takes you to the next step of this guide. It leaves your choices and placements alone.'
    },
    {
      label: 'Check the draft',
      title: 'Check the placements',
      body: 'Start with Needs review. Click a student name to compare their responses with the placement and read why they received it.',
      content: '<dl class="tour-explainer"><div><dt>Needs review</dt><dd>Find records to fix, weak matches and rules the app could not check.</dd></div><div><dt>By student</dt><dd>See each schedule for both weeks and the reason for each placement.</dd></div><div><dt>By project</dt><dd>Check the groups in Week 1 and Week 2. Majors keep the same students; Minors change.</dd></div></dl>',
      note: 'The result still needs review. Check gender balance and whether seniors received priority across the whole draft.'
    },
    {
      label: 'Export for review',
      title: 'Export the draft for review',
      body: 'Export the files for Cayden and Luke to discuss with Mr. Litowitz. He makes the final decisions.',
      content: '<dl class="tour-explainer"><div><dt>Project list</dt><dd>How many students chose each project, your choices and the current placement status.</dd></div><div><dt>Draft placements</dt><dd>Each schedule, the reasons behind it and comments for faculty.</dd></div><div><dt>Review notes</dt><dd>The problems that still need checking alongside the schedules.</dd></div></dl>',
      note: 'This is a local prototype. It leaves the school spreadsheet unchanged. Reloading clears your changes and draft placements.'
    }
  ];

  function render() {
    var current = steps[step];
    dialog.innerHTML = '<div class="tour-top"><span>Project: Pomfret · Walkthrough</span><button class="button quiet small" data-tour-close>Skip walkthrough</button></div>' +
      '<div class="tour-layout"><nav class="tour-nav" aria-label="Walkthrough steps"><ol>' + steps.map(function (item,index) {
        return '<li><button data-tour-step="' + index + '" aria-label="Step ' + (index+1) + ': ' + item.label + '"' + (index===step?' aria-current="step"':'') + '><span class="tour-number" aria-hidden="true">' + (index+1) + '</span><span class="tour-step-name">' + item.label + '</span></button></li>';
      }).join('') + '</ol></nav><section class="tour-content"><h2 id="walkthrough-title" tabindex="-1">' + current.title + '</h2><p id="walkthrough-description" class="tour-description">' + current.body + '</p>' + current.content + '<p class="tour-note">' + current.note + '</p></section></div>' +
      '<div class="tour-bottom"><span class="tour-progress">Step ' + (step+1) + ' of ' + steps.length + '</span><div><button class="button secondary" data-tour-back' + (step===0?' disabled':'') + '>Back</button><button class="button primary" data-tour-next>' + (step===steps.length-1?'Finish walkthrough':'Next') + '</button></div></div>';
    if (dialog.open) document.getElementById('walkthrough-title').focus({preventScroll:true});
  }
  function open() {
    if (dialog.open) return;
    returnFocus = document.activeElement;
    step = 0;
    render();
    dialog.showModal();
    document.getElementById('walkthrough-title').focus({preventScroll:true});
  }
  dialog.addEventListener('click',function (event) {
    var button=event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.hasAttribute('data-tour-close')) { dialog.close(); return; }
    if (button.hasAttribute('data-tour-next')) {
      if (step===steps.length-1) { dialog.close(); return; }
      step+=1;
    } else if (button.hasAttribute('data-tour-back')) step=Math.max(0,step-1);
    else if (button.hasAttribute('data-tour-step')) step=Number(button.dataset.tourStep);
    else return;
    render();
  });
  dialog.addEventListener('close',function () {
    // Finishing, skipping and Escape all leave the workspace exactly as it was.
    var target=returnFocus && returnFocus.isConnected && returnFocus!==document.body ? returnFocus : trigger;
    target.focus({preventScroll:true});
  });
  dialog.addEventListener('keydown',function (event) {
    if (event.key!=='Tab') return;
    var buttons=dialog.querySelectorAll('button:not([disabled])');
    var first=buttons[0], last=buttons[buttons.length-1];
    if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first.focus(); }
    else if (event.shiftKey && (document.activeElement===first || document.activeElement.id==='walkthrough-title')) { event.preventDefault(); last.focus(); }
  });
  trigger.addEventListener('click',open);
  // Show on every fresh opening for presentations; keep errors unobscured.
  if (document.querySelector('#main .page-heading')) open();
}());
