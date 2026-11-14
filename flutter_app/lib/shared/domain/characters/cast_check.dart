/// THE CAST, CHECKED: what an editor says of a cast, read from where each of them is in the book. A principal the book
/// forgets (a lead in hardly any of its chapters); one who goes quiet (there for a stretch, then gone, long before
/// the end: a thread left hanging); two always on the page together (could they be one?); and one in a single
/// chapter, tied to no one (do they earn their place?). Only what the chapters show is said; a book of fewer than
/// three chapters is too young to judge.
///
/// Reads only.
library;

/// What a note is about.
enum NoteKind { forgotten, quiet, together, light }

/// One of the cast as the check sees them: their id, name, roles, the chapters they are in (by number), how many ties
/// they have, and whether they are gone from the story (dead, departed), which explains a silence.
typedef CastMember = ({String id, String name, List<String> roles, Set<int> chapters, int ties, bool gone});

/// A note on the cast: what it is about, who (one, or a pair), and what it says.
typedef CastNote = ({NoteKind kind, List<String> who, String says});

const _principal = {'protagonist', 'antagonist', 'deuteragonist', 'supporting', 'love interest', 'mentor'};

bool _isPrincipal(CastMember m) => m.roles.any((r) => _principal.contains(r.trim().toLowerCase()));
bool _isLead(CastMember m) => m.roles.any((r) => {'protagonist', 'antagonist'}.contains(r.trim().toLowerCase()));

/// "3, 5 and 8".
String _listed(Iterable<int> numbers) {
  final n = [...numbers]..sort();
  if (n.length <= 1) return n.join();
  return '${n.take(n.length - 1).join(', ')} and ${n.last}';
}

/// The notes on [cast] in a book of [chapters] chapters, the weightiest kind first (as they are found), at most
/// [most]; one of each person
/// (two only in a pair).
List<CastNote> castCheck(List<CastMember> cast, {required int chapters, int most = 4}) {
  if (chapters < 3) return const [];
  final notes = <CastNote>[];
  final said = <String>{};
  void note(NoteKind kind, List<CastMember> who, String says) {
    if (who.any((m) => said.contains(m.id))) return;
    said.addAll(who.map((m) => m.id));
    notes.add((kind: kind, who: [for (final m in who) m.id], says: says));
  }

  // A principal the book forgets: in a fifth of its chapters or fewer, from five chapters.
  if (chapters >= 5) {
    for (final m in cast) {
      if (!_isPrincipal(m) || m.gone) continue;
      final share = m.chapters.length / chapters;
      if (share > 0.2) continue;
      final named = m.roles.firstWhere((r) => _principal.contains(r.trim().toLowerCase())).trim().toLowerCase();
      final role = named == 'protagonist' || named == 'antagonist' ? 'your $named' : 'one of your principals';
      note(
        NoteKind.forgotten,
        [m],
        m.chapters.isEmpty
            ? '${m.name} is $role, but not yet in any of the $chapters chapters.'
            : '${m.name} is $role, but in ${m.chapters.length} of $chapters chapters.',
      );
    }
  }

  // Gone quiet: in two or more chapters, the last of them no further than three fifths through a book of six or more.
  if (chapters >= 6) {
    for (final m in cast) {
      if (m.gone || m.chapters.length < 2) continue;
      final last = m.chapters.reduce((a, b) => a > b ? a : b);
      if (last > chapters * 0.6) continue;
      final first = m.chapters.reduce((a, b) => a < b ? a : b);
      note(
        NoteKind.quiet,
        [m],
        '${m.name} is in chapters $first to $last, then gone: ${chapters - last} chapters without them. A thread left '
        'hanging?',
      );
    }
  }

  // Always together: two (neither a lead) in the same chapters, two or more, every time or all but one.
  final others = [
    for (final m in cast)
      if (!_isLead(m) && m.chapters.length >= 2) m,
  ];
  for (var i = 0; i < others.length; i++) {
    for (var j = i + 1; j < others.length; j++) {
      final a = others[i];
      final b = others[j];
      final both = a.chapters.intersection(b.chapters);
      final either = a.chapters.union(b.chapters);
      if (both.length < 2 || either.length - both.length > 1) continue;
      final always = both.length == either.length;
      note(
        NoteKind.together,
        [a, b],
        '${a.name} and ${b.name} are on the page together ${always ? 'every time' : 'almost every time'} '
        '(chapters ${_listed(both)}). Could they be one character?',
      );
    }
  }

  // Light: in one chapter, tied to no one, not a principal, in a book of four or more.
  if (chapters >= 4) {
    for (final m in cast) {
      if (_isPrincipal(m) || m.chapters.length != 1 || m.ties > 0) continue;
      note(
        NoteKind.light,
        [m],
        '${m.name} is in one chapter (${m.chapters.first}) and tied to no one. Do they earn their place, or could '
        'someone already there do what they do?',
      );
    }
  }

  return notes.take(most).toList();
}
