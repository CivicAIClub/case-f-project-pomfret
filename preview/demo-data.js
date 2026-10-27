/* Entirely invented practice responses. Never derived from individual students. */
var PPDemo = (function () {
  function create(projects) {
    var catalog = projects.filter(function (p) { return p.enabled !== false; });
    var students = [];
    for (var i = 0; i < 240; i += 1) {
      var anchor = catalog[i % catalog.length];
      var selections = [anchor.id];
      [3, 7, 11, 16, 19, 23].forEach(function (offset) {
        var id = catalog[(i + offset) % catalog.length].id;
        if (selections.indexOf(id) < 0) selections.push(id);
      });
      var types = Array.from(new Set(anchor.types.concat(catalog[(i + 7) % catalog.length].types)));
      var goals = Array.from(new Set(anchor.goals.concat(catalog[(i + 11) % catalog.length].goals)));
      var number = String(i + 1).padStart(3, '0');
      var previous = i % 8 === 0 ? [catalog[(i + 2) % catalog.length].id] : [];
      students.push({
        id: 'practice-' + number, name: 'Practice Student ' + number,
        email: 'student' + number + '@example.org', grade: 12 - Math.floor(i / 80),
        preference: i % 10 < 2 ? 'Minor' : i % 10 < 5 ? 'Not sure' : 'Major',
        choices: selections, types: types, goals: goals, previous: previous,
        status: i % 20 === 19 ? 'late' : 'eligible', gender: null,
        comments: i % 31 === 0 ? 'Invented example note for the faculty reviewer. This note is not used by the sorter.' : '',
        source: {sheet: 'Practice ' + (12 - Math.floor(i / 80)), row: (i % 80) + 2},
        issues: i % 20 === 19 ? ['Practice example: green status is placed after other students.'] : []
      });
    }
    ['trip','trip','trip','trip','trip','trip','trip','trip','leader','leader','leader','review','review'].forEach(function (status, index) {
      var number = String(241 + index).padStart(3, '0');
      students.push({id:'practice-' + number,name:'Practice Student ' + number,email:status === 'review' ? '' : 'student' + number + '@example.org',grade:10 + index % 3,preference:'Not sure',choices:[],types:[],goals:[],previous:[],status:status,gender:null,comments:'',source:{sheet:'Practice roster',row:index + 2},issues:status === 'review' ? ['Practice example: missing email requires review.'] : []});
    });
    return students;
  }
  return {create:create};
}());
if (typeof module !== 'undefined' && module.exports) module.exports = PPDemo;
