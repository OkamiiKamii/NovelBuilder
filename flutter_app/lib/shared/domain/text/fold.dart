/// Text compared the way the original app's search compares it: decomposed (Unicode NFD), with combining accents
/// (U+0300–U+036F) dropped, then lower-cased. "Émile" matches "emile"; "Øster" does not match "oster", as there.
///
/// Dart has no Unicode normalisation, so the decompositions are a table generated from Unicode 16.0.0 data for Latin,
/// Greek, Cyrillic and the other scripts whose letters decompose into a base and these accents
/// (`tool/golden/fold_table.py` regenerates it). Hangul syllables are left whole: folding never changes whether two
/// texts match there, only how they are spelled inside.
String foldText(String text) {
  final out = StringBuffer();
  for (final rune in text.runes) {
    if (rune >= 0x300 && rune <= 0x36F) continue;
    final folded = _decomposed[rune];
    out.write(folded ?? String.fromCharCode(rune));
  }
  return out.toString().toLowerCase();
}

/// Text as the original app's canon comparison reads it: lower-cased, decomposed (NFKD), and every run of anything
/// that is not a letter or a digit (the accents decomposition leaves behind among them) made one space. "Réal" reads
/// "re al", as there.
String nfkdWords(String text) {
  const ligatures = {'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st'};
  final out = StringBuffer();
  for (final rune in text.toLowerCase().runes) {
    final char = String.fromCharCode(rune);
    final base = _decomposed[rune];
    // The accent a decomposition leaves is neither a letter nor a digit: it reads as a space.
    out.write(base != null ? '$base ' : (ligatures[char] ?? char));
  }
  return out.toString().replaceAll(RegExp(r'[^\p{L}\p{N}]+', unicode: true), ' ').trim();
}

final Map<int, String> _decomposed = () {
  final map = <int, String>{};
  final from = _from.runes.toList();
  final to = _to.split('|');
  for (var i = 0; i < from.length; i++) {
    map[from[i]] = to[i];
  }
  return map;
}();

const _from =
    'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿĀāĂăĄąĆćĈĉĊċČčĎďĒ'
    'ēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭĮįİĴĵĶķĹĺĻļĽľŃńŅņŇňŌōŎŏŐőŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũ'
    'ŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžƠơƯưǍǎǏǐǑǒǓǔǕǖǗǘǙǚǛǜǞǟǠǡǢǣǦǧǨǩǪǫǬǭǮǯǰǴǵǸǹǺǻǼǽǾǿȀȁ'
    'ȂȃȄȅȆȇȈȉȊȋȌȍȎȏȐȑȒȓȔȕȖȗȘșȚțȞȟȦȧȨȩȪȫȬȭȮȯȰȱȲȳ̛̖̗̘̙̀́̂̃̄̅̆̇̈̉̊̋̌̍̎̏̐̑̒̓̔̕̚'
    '̴̵̶̷̸̡̢̧̨̜̝̞̟̠̣̤̥̦̩̪̫̬̭̮̯̰̱̲̳̹̺̻̼͇͈͉͍͎̽̾̿̀́͂̓̈́͆͊͋͌ͅ͏͓͔͕͖͙͚͐͑͒͗͛͘͜͟͝͞͠͡'
    'ͣͤͥͦͧͨͩͪͫͬͭͮͯ͢ʹ;΅Ά·ΈΉΊΌΎΏΐΪΫάέήίΰϊϋόύώϓϔЀЁЃЇЌЍЎЙйѐёѓїќѝўѶѷӁӂӐӑӒӓӖӗӚӛӜӝ'
    'ӞӟӢӣӤӥӦӧӪӫӬӭӮӯӰӱӲӳӴӵӸӹآأؤإئۀۂۓऩऱऴक़ख़ग़ज़ड़ढ़फ़य़োৌড়ঢ়য়ਲ਼ਸ਼ਖ਼ਗ਼ਜ਼ਫ਼ୈୋୌଡ଼ଢ଼ஔொோௌైೀೇೈೊೋൊോൌ'
    'ේොෝෞགྷཌྷདྷབྷཛྷཀྵཱཱིུྲྀླཱྀྀྒྷྜྷྡྷྦྷྫྷྐྵဦᬆᬈᬊᬌᬎᬒᬻᬽᭀᭁᭃḀḁḂḃḄḅḆḇḈḉḊḋḌḍḎḏḐḑḒḓḔḕḖḗḘḙḚḛḜḝḞḟḠḡḢḣḤ'
    'ḥḦḧḨḩḪḫḬḭḮḯḰḱḲḳḴḵḶḷḸḹḺḻḼḽḾḿṀṁṂṃṄṅṆṇṈṉṊṋṌṍṎṏṐṑṒṓṔṕṖṗṘṙṚṛṜṝṞṟṠṡṢṣṤṥṦṧṨṩṪ'
    'ṫṬṭṮṯṰṱṲṳṴṵṶṷṸṹṺṻṼṽṾṿẀẁẂẃẄẅẆẇẈẉẊẋẌẍẎẏẐẑẒẓẔẕẖẗẘẙẛẠạẢảẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵ'
    'ẶặẸẹẺẻẼẽẾếỀềỂểỄễỆệỈỉỊịỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợỤụỦủỨứỪừỬửỮữỰựỲỳỴỵỶỷỸỹἀἁ'
    'ἂἃἄἅἆἇἈἉἊἋἌἍἎἏἐἑἒἓἔἕἘἙἚἛἜἝἠἡἢἣἤἥἦἧἨἩἪἫἬἭἮἯἰἱἲἳἴἵἶἷἸἹἺἻἼἽἾἿὀὁὂὃὄὅὈὉὊὋὌὍ'
    'ὐὑὒὓὔὕὖὗὙὛὝὟὠὡὢὣὤὥὦὧὨὩὪὫὬὭὮὯὰάὲέὴήὶίὸόὺύὼώᾀᾁᾂᾃᾄᾅᾆᾇᾈᾉᾊᾋᾌᾍᾎᾏᾐᾑᾒᾓᾔᾕᾖᾗᾘᾙᾚᾛ'
    'ᾜᾝᾞᾟᾠᾡᾢᾣᾤᾥᾦᾧᾨᾩᾪᾫᾬᾭᾮᾯᾰᾱᾲᾳᾴᾶᾷᾸᾹᾺΆᾼι῁ῂῃῄῆῇῈΈῊΉῌ῍῎῏ῐῑῒΐῖῗῘῙῚΊ῝῞῟ῠῡῢΰῤῥῦῧῨῩ'
    'ῪΎῬ῭΅`ῲῳῴῶῷῸΌῺΏῼ´  ΩKÅ↚↛↮⇍⇎⇏∄∉∌∤∦≁≄≇≉≠≢≭≮≯≰≱≴≵≸≹⊀⊁⊄⊅⊈⊉⊬⊭⊮⊯⋠⋡⋢⋣⋪⋫⋬⋭〈〉⫝̸が'
    'ぎぐげござじずぜぞだぢづでどばぱびぴぶぷべぺぼぽゔゞガギグゲゴザジズゼゾダヂヅデドバパビピブプベペボポヴヷヸヹヺヾיִײַשׁשׂשּׁשּׂאַאָאּבּגּדּהּ'
    'וּזּטּיּךּכּלּמּנּסּףּפּצּקּרּשּתּוֹבֿכֿפֿ';

const _to =
    'A|A|A|A|A|A|C|E|E|E|E|I|I|I|I|N|O|O|O|O|O|U|U|U|U|Y|a|a|a|a|a|a|c|e|e|'
    'e|e|i|i|i|i|n|o|o|o|o|o|u|u|u|u|y|y|A|a|A|a|A|a|C|c|C|c|C|c|C|c|D|d|E|'
    'e|E|e|E|e|E|e|E|e|G|g|G|g|G|g|G|g|H|h|I|i|I|i|I|i|I|i|I|J|j|K|k|L|l|L|'
    'l|L|l|N|n|N|n|N|n|O|o|O|o|O|o|R|r|R|r|R|r|S|s|S|s|S|s|S|s|T|t|T|t|U|u|'
    'U|u|U|u|U|u|U|u|U|u|W|w|Y|y|Y|Z|z|Z|z|Z|z|O|o|U|u|A|a|I|i|O|o|U|u|U|u|'
    'U|u|U|u|U|u|A|a|A|a|Æ|æ|G|g|K|k|O|o|O|o|Ʒ|ʒ|j|G|g|N|n|A|a|Æ|æ|Ø|ø|A|a|'
    'A|a|E|e|E|e|I|i|I|i|O|o|O|o|R|r|R|r|U|u|U|u|S|s|T|t|H|h|A|a|E|e|O|o|O|'
    'o|O|o|O|o|Y|y|||||||||||||||||||||||||||||||||||||||||||||||||||||||||'
    '||||||||||||||||||||||||||||||||||||||||||||||||||||||||ʹ|;|¨|Α|·|Ε|Η|'
    'Ι|Ο|Υ|Ω|ι|Ι|Υ|α|ε|η|ι|υ|ι|υ|ο|υ|ω|ϒ|ϒ|Е|Е|Г|І|К|И|У|И|и|е|е|г|і|к|и|у|'
    'Ѵ|ѵ|Ж|ж|А|а|А|а|Е|е|Ә|ә|Ж|ж|З|з|И|и|И|и|О|о|Ө|ө|Э|э|У|у|У|у|У|у|Ч|ч|Ы|'
    'ы|آ|أ|ؤ|إ|ئ|ۀ|ۂ|ۓ|ऩ|ऱ|ऴ|क़|ख़|ग़|ज़|ड़|ढ़|फ़|य़|ো|ৌ|ড়|ঢ়'
    '|য়|ਲ਼|ਸ਼|ਖ਼|ਗ਼|ਜ਼|ਫ਼|ୈ|ୋ|ୌ|ଡ଼|ଢ଼|ஔ|ொ|ோ|ௌ|ై|ೀ|ೇ|ೈ|ೊ|ೋ|ൊ'
    '|ോ|ൌ|ේ|ො|ෝ|ෞ|གྷ|ཌྷ|དྷ|བྷ|ཛྷ|ཀྵ|ཱི|ཱུ|ྲྀ|ླྀ|ཱྀ|ྒྷ|ྜྷ|ྡྷ|ྦྷ|ྫྷ|ྐྵ'
    '|ဦ|ᬆ|ᬈ|ᬊ|ᬌ|ᬎ|ᬒ|ᬻ|ᬽ|ᭀ|ᭁ|ᭃ|A|a|B|b|B|b|B|b|C|c|D|d|D|d|D|d|D'
    '|d|D|d|E|e|E|e|E|e|E|e|E|e|F|f|G|g|H|h|H|h|H|h|H|h|H|h|I|i|I|i|K|k|K|k'
    '|K|k|L|l|L|l|L|l|L|l|M|m|M|m|M|m|N|n|N|n|N|n|N|n|O|o|O|o|O|o|O|o|P|p|P'
    '|p|R|r|R|r|R|r|R|r|S|s|S|s|S|s|S|s|S|s|T|t|T|t|T|t|T|t|U|u|U|u|U|u|U|u'
    '|U|u|V|v|V|v|W|w|W|w|W|w|W|w|W|w|X|x|X|x|Y|y|Z|z|Z|z|Z|z|h|t|w|y|ſ|A|a'
    '|A|a|A|a|A|a|A|a|A|a|A|a|A|a|A|a|A|a|A|a|A|a|E|e|E|e|E|e|E|e|E|e|E|e|E'
    '|e|E|e|I|i|I|i|O|o|O|o|O|o|O|o|O|o|O|o|O|o|O|o|O|o|O|o|O|o|O|o|U|u|U|u'
    '|U|u|U|u|U|u|U|u|U|u|Y|y|Y|y|Y|y|Y|y|α|α|α|α|α|α|α|α|Α|Α|Α|Α|Α|Α|Α|Α|ε'
    '|ε|ε|ε|ε|ε|Ε|Ε|Ε|Ε|Ε|Ε|η|η|η|η|η|η|η|η|Η|Η|Η|Η|Η|Η|Η|Η|ι|ι|ι|ι|ι|ι|ι|ι'
    '|Ι|Ι|Ι|Ι|Ι|Ι|Ι|Ι|ο|ο|ο|ο|ο|ο|Ο|Ο|Ο|Ο|Ο|Ο|υ|υ|υ|υ|υ|υ|υ|υ|Υ|Υ|Υ|Υ|ω|ω|ω'
    '|ω|ω|ω|ω|ω|Ω|Ω|Ω|Ω|Ω|Ω|Ω|Ω|α|α|ε|ε|η|η|ι|ι|ο|ο|υ|υ|ω|ω|α|α|α|α|α|α|α|α'
    '|Α|Α|Α|Α|Α|Α|Α|Α|η|η|η|η|η|η|η|η|Η|Η|Η|Η|Η|Η|Η|Η|ω|ω|ω|ω|ω|ω|ω|ω|Ω|Ω|Ω'
    '|Ω|Ω|Ω|Ω|Ω|α|α|α|α|α|α|α|Α|Α|Α|Α|Α|ι|¨|η|η|η|η|η|Ε|Ε|Η|Η|Η|᾿|᾿|᾿|ι|ι|ι'
    '|ι|ι|ι|Ι|Ι|Ι|Ι|῾|῾|῾|υ|υ|υ|υ|ρ|ρ|υ|υ|Υ|Υ|Υ|Υ|Ρ|¨|¨|`|ω|ω|ω|ω|ω|Ο|Ο|Ω|Ω'
    '|Ω|´| | |Ω|K|A|←|→|↔|⇐|⇔|⇒|∃|∈|∋|∣|∥|∼|≃|≅|≈|=|≡|≍|<|>|≤|≥|≲|≳|≶|≷|≺|≻'
    '|⊂|⊃|⊆|⊇|⊢|⊨|⊩|⊫|≼|≽|⊑|⊒|⊲|⊳|⊴|⊵|〈|〉|⫝|が|ぎ|ぐ|げ|ご|ざ|じ|ず|ぜ|ぞ|た'
    '゙|ぢ|づ|で|ど|ば|ぱ|び|ぴ|ぶ|ぷ|べ|ぺ|ぼ|ぽ|ゔ|ゞ|ガ|ギ|グ|ゲ|ゴ|ザ|ジ'
    '|ズ|ゼ|ゾ|ダ|ヂ|ヅ|デ|ド|バ|パ|ビ|ピ|ブ|プ|ベ|ペ|ボ|ポ|ヴ|ヷ|ヸ|ヹ|ヺ|'
    'ヾ|יִ|ײַ|שׁ|שׂ|שּׁ|שּׂ|אַ|אָ|אּ|בּ|גּ|דּ|הּ|וּ|זּ|טּ|יּ|ךּ|כּ|לּ|מּ|נּ'
    '|סּ|ףּ|פּ|צּ|קּ|רּ|שּ|תּ|וֹ|בֿ|כֿ|פֿ';
