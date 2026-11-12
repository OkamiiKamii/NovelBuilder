/// The text of the sample novel, "The Drowned Road": fifteen chapters in three parts, written for this app (original,
/// owned by the project). Paragraphs are separated by blank lines. Its records (people, places, threads, plans, the
/// timeline) are made in `sample_novel.dart`.
library;

typedef SampleChapter = ({String title, String summary, String text});

const samplePartTitles = ['Part One: Low Water', 'Part Two: The Road', 'Part Three: High Water'];

/// Chapters per part, in order: five, five and five.
const sampleChaptersPerPart = 5;

const sampleChapters = <SampleChapter>[
  // ----------------------------------------------------------------------------------------- Part One: Low Water
  (
    title: 'The Bell',
    summary: 'The tide bell rings for the first time in thirty-one years. Ilse will not let Wren finish her chart.',
    text: r'''
The bell in the Wardens’ tower had not rung in thirty-one years, and when it rang, Wren Hollis dropped a bottle of ink.

It was the good ink, the oak-gall black that Master Marrow bought from the south-coast boats twice a year, and it went across the floorboards of the shop like a spill of night. Wren did not move to wipe it. She stood with her hands open and listened.

One stroke. A long breath of silence. A second stroke, deeper, as if the bell had to remember how. Then a third, and a fourth, and after that they came steadily, rolling out over the roofs of Vell and down the hill to the harbour, where the gulls rose all at once from the masts.

Everyone in Vell knew what the bell meant. Children learned it with their letters. When the Wardens’ bell rings nine times nine, the sea goes out to see what it has drowned.

Wren counted to forty before she lost the count. By then the street outside was full. Doors banged. A woman ran past with a baby on her hip and her apron still floury. Two apprentices from the Ferrymen’s Company went by at a sprint, laughing like boys let out of school, though both of them were older than Wren.

“Wren.” Master Marrow’s voice came down the stair, thin and dry. “Wren, what is that?”

“The tide bell,” Wren said. Her own voice sounded strange to her. “Master, it’s the tide bell.”

There was a long pause from upstairs. Then the slow knock of a cane, one step at a time, and Ilse Marrow came down into the shop in her night robe with a shawl across her shoulders. She was fifty and half blind, though she looked older than both, and she had drawn every chart of the bay of Vell that was worth owning. She stopped on the bottom stair and turned her face toward the window, toward the sound.

“So soon,” she said.

“It’s been thirty-one years.”

“I know how long it has been.” Ilse lowered herself onto the stair. In the grey light from the window her face looked carved. “Is the water going?”

Wren went to the window. From the shop on Lantern Street you could see a wedge of the harbour between the chandler’s roof and the old customs house. She had looked at that wedge every morning for six years, since the day she had come to Ilse Marrow as an apprentice with nothing but a pencil and a good eye. She knew its colours the way she knew her own hand.

The colour was wrong. Along the harbour wall, a pale band showed where no band should be: wet stone, green with weed, shining. Below it, the water was drawing back. Not fast. Not like a wave. Like a breath being let out, slowly, by something very large and very patient.

“It’s going,” Wren said.

Ilse said nothing.

“Nine days,” Wren said. She could not keep the hope out of it, and did not try. “Nine days of low water. The road will come up out of the bay, all the way to Old Merrow. Master, no one has charted it. Not properly. Not since—”

“Since me.” Ilse turned her face from the window. “Say it. You may as well.”

Wren swallowed. “Since you.”

On the wall behind the counter, in a frame that Wren dusted every Sunday, hung the most famous chart in Vell: The Bay at Low Water, drawn by Ilse Marrow in her nineteenth year. It showed the long curve of the Drowned Road leaving the shore below Hollow Light, the markers along it numbered in a young woman’s careful hand, one, two, three. And then nothing. Past the third marker the road ran into blank paper, and the blank went on to the edge of the sheet, where the town of Old Merrow should have been.

People came from three cities to look at that chart. They always asked about the blank. Ilse never answered.

“You want to go out there,” Ilse said.

“I want to finish it.”

“It is not yours to finish.” Ilse’s hand tightened on her cane. “Wipe up the ink, Wren. It will stain.”

Wren knelt and wiped up the ink. Outside, the bell went on and on, and under it, very faintly, came a sound she had never heard in her life: the sea, going away.
''',
  ),
  (
    title: 'Half a Map',
    summary: 'The road rises out of the bay. In Ilse’s old notebook Wren finds Kit’s name and a column of numbers.',
    text: r'''
By noon the harbour was a field of mud, and all of Vell had come down to look at it.

Wren went too, because Ilse had shut herself in her room and would not come out, and because she could not have stayed away if the shop had been on fire. She stood at the end of the long quay among fishwives and clerks and Wardens in their grey coats, and she looked.

The bay of Vell was emptying. Boats that had swung at anchor that morning lay tilted on their sides in the mud, like sleeping dogs. Beyond them, the sea had drawn back a full mile, and it was still going. And far out, where the mud gave way to rippled sand, something long and dark had begun to rise.

The Drowned Road.

From the quay it looked like nothing much: a low line of stone, straight as a rule, running out from the shore below Hollow Light toward the horizon. But Wren knew what it was. Every child in Vell knew. It was the old causeway to Merrow, the town that had stood out in the bay before the sea took it, three hundred years ago. Once in a generation the water went out far enough to show it, and for nine days you could walk it, if you were brave or a fool.

“Thinking of a stroll?”

Wren turned. A Warden stood beside her, a young man with a lantern badge on his collar and the bored, pleasant face of someone who had been told to stand somewhere all day.

“Just looking,” Wren said.

“Look all you like. Provost’s orders: nobody sets foot on the sand.” He nodded out at the road. “Last time, twelve went out. One came back.”

“I know,” Wren said. “She’s my master.”

She left him staring and walked back up the hill.

Ilse’s door was still shut. Wren stood outside it for a while. Then she went into the workroom, where the big chart table stood under the north window, and she opened the flat drawer where Ilse kept her own papers.

She had never done this before. In six years she had never once opened that drawer without being told to.

The notebook was at the bottom, under a roll of old proofs: a small book bound in green cloth gone grey with age, its corners soft as felt. Inside, in the same careful hand as the famous chart, were the field notes of a nineteen-year-old cartographer. Bearings. Distances. Little sketches of the markers, each one a standing stone with a carved sign on its face: a fish, a wheel, a key. Notes in the margins. Kit says the third stone is older than the others. Kit says we have time.

Kit.

Wren knew the name. Everyone in Vell knew the name, though nobody said it to Ilse. Kit Marrow, her younger brother, seventeen years old, who had walked out on the Drowned Road thirty-one years ago with his sister and ten others and never come back.

She turned the pages. The notes ran on past the third marker, a few lines, and then stopped mid-sentence. The rest of the page was blank. On the next page, though, there was something else: a column of numbers in a different ink, written later, written by an older hand. Dates and times. Beside some of them, a small mark like a cut.

Wren did not understand it. She copied it out anyway, quickly, onto the back of a proof, and slid the notebook back beneath the roll exactly as it had been.

When she turned around, Ilse was standing in the doorway.

For a long moment neither of them spoke. Ilse could not see well, but she could see enough. She looked at the open drawer, and then at Wren.

“He was faster than me,” Ilse said at last. “He always was. When the water came, he was ahead.”

“Master, I—”

“Close the drawer.” Her voice did not rise. “And go to bed. Whatever you are going to do, you will do it. I could not stop him either.”
''',
  ),
  (
    title: 'The Ferryman’s Son',
    summary:
        'Tobiah Fenn refuses, then takes Wren to his grandmother, who sings the old ferry song: the signs on the stones.',
    text: r'''
Tobiah Fenn was mending a net on an upturned boat when Wren found him, and he did not stop when she said his name.

“No,” he said.

“You haven’t heard what I want.”

“You’re Marrow’s girl. The bell’s rung. You want someone who knows the bay to take you out on the sand.” He pulled a knot tight with his teeth. “No.”

He was a year or two older than Wren, broad in the shoulders, with the wind-reddened face of every ferryman in Vell and hands that never seemed to be still. The Fenns had worked the crossings for longer than anyone remembered. If anyone alive knew how the water moved in the bay, it was a Fenn.

“I can pay,” Wren said.

“Pay for my funeral, will you?” He finally looked up. “The Company’s forbidden it. The Wardens have forbidden it. My gran says the road eats people, and she was there last time, watching from the shore. She watched them go out. She watched the water come back.”

“Your grandmother was there?”

Something in her voice made him put the net down.

His grandmother lived in two rooms above the Ferrymen’s hall, at the top of a stair so steep it was nearly a ladder. Nan Ottilie was small and brown and very old, and she sat in a chair by the window with a blanket over her knees and a cat over the blanket. She looked at Wren for a long time with eyes like wet black stones.

“Ilse Marrow’s apprentice,” she said. “I knew she would send someone in the end.”

“She didn’t send me.”

“No,” Nan agreed. “She never sends anyone. That is her trouble.” She stroked the cat. “What do you want, child?”

Wren told her. The chart, the blank, the nine days. She did not mention the column of numbers. She was not sure why.

When she had finished, Nan was quiet for a while. Then, in a cracked, true voice, she began to sing.

It was an old tune, a ferry song, the kind sung to keep the oars together. Wren had heard bits of it all her life without listening to the words. She listened now.

Fish to the morning, wheel to the west,

Key in the water and lock in the chest.

Count the stones, girl, count them through,

The seventh stone is waiting for you.

Nan stopped. The cat yawned.

“My mother taught me that,” she said, “and her father taught her. They used to say it was the way across. Nobody believes it now. They think it is just a song for rowing.”

Wren’s heart was beating very fast. “A fish. A wheel. A key.” The signs on the markers. Ilse’s sketches. “Nan, those are the stones.”

“Are they?” said Nan Ottilie, and smiled with no teeth at all.

On the stair, going down, Tobiah caught her arm.

“You’re going whatever I say,” he said. It was not a question.

“Yes.”

He let out a breath through his nose, long and annoyed, exactly like the sea going out. “Then I’m coming. Somebody who knows the water had better.”
''',
  ),
  (
    title: 'The Wardens’ Notice',
    summary:
        'The Provost closes the sands: nine days, says his notice. At night Wren finds the fish stone, and is watched.',
    text: r'''
The notice went up on the second morning, nailed to the door of every chapel and tavern in Vell.

BY ORDER OF THE PROVOST OF THE TIDEWARDENS. The sands of the bay are closed for the duration of the low water. Any person found below the tide line will be taken up and held until the sea returns. The Wardens’ tables give the low water as NINE DAYS from the first bell. Do not trust your life to the road.

It was signed in a sharp black hand: Aldous Crane.

Wren read it twice, standing in the crowd outside the fish market. Around her people grumbled, but not very much. Nobody really wanted to go out there. The ones who did were the kind who did not read notices.

“Nine days,” somebody said behind her. “Plenty of time, if a man were careful.”

She turned, but the speaker had already gone, and all she saw was the back of a good blue coat, the kind the Salt Guild’s factors wore.

That night she and Tobiah went down to the shore below Hollow Light.

The lighthouse stood on its spur of black rock at the eastern end of the bay, its lamp turning slowly overhead. Under it, at the very edge of what had been sea, the Drowned Road began. Tobiah had brought a shuttered lantern and a coil of rope. Wren had brought her drawing board, a compass, and the copy she had made of Ilse’s first page.

They did not go far. That was the agreement: not tonight. Tonight they only looked.

The first marker stood a hundred yards out, where the causeway lifted clear of the mud. It was a single standing stone, taller than Tobiah, crusted with barnacles and hung with weed. Wren held the lantern up to it with a hand that would not stay steady.

On its seaward face, worn soft by three hundred years of water, someone had carved a fish.

“Fish to the morning,” Tobiah said quietly.

Wren took a bearing on it, and another on the lamp of Hollow Light, and wrote down the numbers. Her pencil shook. She made herself go slowly, as Ilse had taught her. Measure twice. Draw once. The sea does not care how excited you are.

Behind them, up on the cliff path, a lantern moved and stopped.

Tobiah saw it first. He closed the shutter of their own lamp with a snap, and they crouched together against the cold flank of the stone, listening to the mud tick and settle around them.

The other lantern stayed where it was for a long time. Then it turned, and went back toward the town.

“Wardens,” Tobiah breathed.

“Maybe,” Wren said. But she had seen, in the moment before it turned, the shape of the person holding it. Tall. Thin. Standing very straight, the way only one man in Vell stood.
''',
  ),
  (
    title: 'The Guild Makes an Offer',
    summary: 'Sefa Quill offers two hundred crowns for a chart to Old Merrow. The last date in Ilse’s column is Kit’s.',
    text: r'''
Sefa Quill came to the shop on the third day, at an hour when honest customers were still at breakfast.

She was not much older than Wren, which was surprising, because she was the Salt Guild’s chief factor in Vell, and the Guild did not hand that coat to anyone who could not carry it. She wore it well. She wore everything well. She came in out of the drizzle with her hood back and her dark hair pinned up and not a drop of water on her, somehow, and she stood in front of the famous chart for a while with her hands behind her back.

“Beautiful,” she said. “And useless, past the third stone.”

“It’s not for sale,” Wren said.

“I don’t want it.” Sefa turned. “I want the rest.”

She laid it out plainly, the way the Guild did business. Old Merrow had been a rich town, before the sea came. A salt town. Its warehouses had gone down full. The Guild held the old charter that gave salvage rights to anyone who could reach the place and mark a safe road to it. Three hundred years, and nobody had managed it.

“The Guild will send a crew out on the sixth day,” Sefa said. “Twelve good people, with sledges and ropes. On the ninth day the tide comes back, and by then we will be home with whatever is worth carrying. All we need is the way.”

“Then you need my master.”

“Your master has said no to the Guild every year for thirty years.” Sefa’s voice softened, very slightly. “I didn’t come for her, Miss Hollis. I came for you. Everyone in Lantern Street knows you’ve been going down to Hollow Light at night.”

Wren felt her face go hot.

“I’m not here to make trouble for you,” Sefa said. “I’m here to pay you. A hundred crowns for a chart of the road to Old Merrow, delivered by the fifth evening. Two hundred if it’s good.”

Two hundred crowns. It was more than Ilse’s shop made in a year. It was a press of her own, and paper, and a door with her name on it.

“And if I say no?”

Sefa shrugged. “Then we go on the sixth day anyway, with what we have, which is your master’s chart and a great deal of rope.” She pulled on her gloves. “I would rather go with yours.”

After she had gone, Wren stood for a long time looking at the blank part of the chart.

Ilse came down at noon, slowly, feeling for each stair. She sat in her chair by the stove and held out her hands to it, and said, without turning her head, “That was the Quill girl.”

“Yes.”

“The Guild sent a factor last time too. A man called Doran. A good man, I thought. He was very sure of the tables.” Ilse’s hands were not quite steady. “He had a crew of ten. My brother and I went out with them, because they had sledges and rope and we had only a notebook.”

Wren waited.

“Tell her no,” Ilse said.

“I already did.”

“Tell her again.” Ilse closed her eyes. “And tell her to stay off the road, though she won’t. They never do.”

Wren went to the workroom and took out the copy she had made of the column of numbers. She laid it on the chart table beside her own bearings from the first marker, and she looked from one to the other until the light went.

The numbers still meant nothing. But there was one thing she noticed now that she had not noticed before. The last entry in the column, the one with the deepest cut beside it, was a date thirty-one years ago. The sixth day of the last low water.

The day Kit Marrow had not come back.
''',
  ),
  // ----------------------------------------------------------------------------------------- Part Two: The Road
  (
    title: 'First Marker',
    summary:
        'Wren and Tobiah walk the road to the wheel stone and the key stone, where Ilse’s chart ends. Wren draws on.',
    text: r'''
They went out on the third night, in the dark of the moon, with the tide a mile and a half away and still going.

Tobiah went first, with the lantern shuttered to a slit and the rope tied from his belt to Wren’s. The causeway was wider than it had looked from the quay, nearly the width of a cart, and it was paved: great square slabs of grey stone, fitted so close you could not have slid a knife between them. Weed lay over everything in heavy wet ropes. Crabs scuttled away from the light. Under their boots the old road was slick and solid and very cold.

At the fish stone, Wren stopped, and checked her bearings, and wrote. Then they went on.

It was strange, walking on the bottom of the sea. Strange and quiet. On either side of the road the sand stretched away into darkness, ribbed and pale and studded with things the water had left behind: the black hull of a wreck, a field of mussel beds, a single iron anchor standing upright like a gravestone. Behind them, Hollow Light swung its slow beam across the bay, and every time it passed over them Wren felt seen.

“How far to the second stone?” Tobiah asked.

“By Ilse’s notes, eight hundred paces.”

He counted under his breath. She counted too. At seven hundred and ninety, the lantern found it.

The wheel stone was shorter than the first and leaned a little to the west, as if it had been pushed by a giant’s shoulder. The wheel on its face had eight spokes. Wren held up Ilse’s sketch beside it and laughed out loud, a short helpless sound, because the young Ilse had drawn it exactly, even the crack that ran through the third spoke.

“Wheel to the west,” Tobiah said.

“The road bends here.” Wren pointed. Beyond the stone, the causeway turned, gently, toward the west. “Look. You’d never see it from the shore. From the quay it looks straight.”

“Why would it bend?”

“Because there was something in the way, when they built it.” She was already drawing. “Rock, maybe. Or deep water. Ilse marked it. See, here. She marks the bend and writes deep channel north.”

Tobiah crouched at the edge of the paving and held the lantern out over the sand. A few yards from the road, the ripples dropped away into a long dark trough, still holding water, black and smooth.

“That’s where the sea comes back first,” he said slowly. “That channel. When the tide turns, it’ll fill from there.” He looked up at her. “If you were on the road past this stone when it filled, you’d be cut off from the shore.”

Wren wrote that down too.

They went on, more slowly now, Tobiah watching the channel and Wren watching her compass. The night was very still. Somewhere far out, beyond the reach of the lantern, a bird called once and did not call again.

At the third stone, they stopped.

It stood a little apart from the road, on a low mound of shingle, and it was older than the others. You could see it even by lantern light. Its edges were softer. Its carving was nearly gone. But when Wren ran her fingers over the face of it, she could feel the shape: a long shank, a round bow, teeth.

“Key in the water,” she whispered.

This was where Ilse’s chart ended. This was where the famous blank began.

Wren stood with her back against the key stone and looked out along the road, the way Ilse must have looked thirty-one years ago. The causeway ran on into the dark. Somewhere out there, four more stones. Somewhere out there, Old Merrow.

“We should go back,” Tobiah said. “It’s three hours to the shore. And the light’s coming.”

He was right. In the east, behind Hollow Light, the sky had begun to grey.

Wren took her bearings on the key stone, and on the lighthouse, and on the faint grey loom of the headland to the north. She wrote them down with great care. Then, before she turned back, she did one more thing. She took her pencil and, on a fresh sheet, past the place where her copy of Ilse’s road ended, she drew a short, firm line. Not a guess. Just the next fifty paces of road, exactly as she could see it in the lantern light.

It was the first line anyone had added to that chart in thirty-one years.
''',
  ),
  (
    title: 'The Song and the Stones',
    summary:
        'The song is a map. The lock stone stands inside a wreck; beyond it, Old Merrow’s tower. The channel is filling.',
    text: r'''
“Count the stones, girl, count them through,” sang Nan Ottilie, and broke off to cough. “That is all of it, I’m afraid. My mother had more verses, but I was a child and only kept the chorus.”

It was the fourth morning. Wren had slept two hours and drunk four cups of Nan’s terrible tea, and her hands smelled of salt and lantern oil. Tobiah sat on the floor by the stove with the cat in his lap, looking as tired as she felt.

“Four stones we haven’t found,” Wren said. “And the song gives us three signs. Fish, wheel, key. And then lock.”

“Lock in the chest,” said Nan. “I always thought that meant a treasure. Every child does.”

“What if it means a stone? A fourth stone, with a lock on it.” Wren spread her sheets across Nan’s little table. She had redrawn everything that morning, fair and clean: the fish stone, the bend at the wheel, the deep channel, the key on its shingle mound. “Every sign is where a stone is. Fish to the morning: the fish stone faces east. Wheel to the west: the road turns west at the wheel. Key in the water: the key stone stands off the road, in what would have been water. So the lock stone—”

“Lock in the chest,” Tobiah said. He sat up. The cat complained. “There’s a wreck past the key stone. I saw it last night, when the light came. A big hull, lying north of the road. Old. A chest is a box. A hull is a box.”

They looked at each other.

“Seven stones,” Nan said, very softly. “The seventh is waiting.” She shook her head. “I never thought anyone would sing it for the walking again.”

They went out again that night. It was quicker now that they knew the way; Wren had marked every slick slab and every gap in the paving, and they reached the key stone with the stars still bright. Past it, the road ran on, and the lantern showed what Wren had glimpsed at dawn: the paving narrowing, the weed thicker, the sand on either side lower and wetter than before.

Two hundred paces on, the wreck rose out of the dark.

It lay on its side to the north of the road, a great black curve of timbers furred with weed. It must have been a salt ship once, big and broad, and it had gone down a long time ago; the wood was as hard as stone. Tobiah held up the lantern. Wren walked along the length of it, and at the place where the hull had broken open, where you could see the ribs inside like the ribs of a whale, she found the lock stone.

It stood inside the wreck. The ship had come down on top of it, centuries ago, and settled around it, so that the stone stood up through the broken planking like a heart in a chest. Its sign was clear and sharp, sheltered by the timbers: a round lock with a keyhole.

“Lock in the chest,” Tobiah said, and his voice cracked like his grandmother’s.

Wren drew it. She drew the wreck around it, and its bearings, and its distance from the key stone. Her hands were perfectly steady now.

Beyond the wreck, the road went on toward the west and the dark. And far out, so far she was not sure at first that she saw it at all, something stood up against the stars. A thin black finger, taller than any stone.

“Tobiah,” she said. “Look.”

He looked for a long time.

“That’s a tower,” he said. “That’s a bell tower.”

Old Merrow.

They did not go on. They could not; it was too far, and the night was half gone. But on the way back, at every stone, Wren stopped and checked the bearings again, and at the deep channel by the wheel stone Tobiah lay on his stomach and put his arm into the black water up to the shoulder, and pulled it out, and said nothing at all.

When they reached the shore, she asked him what he had felt.

“It’s moving,” he said. “The water in the channel. It’s moving toward the land.”

“That can’t be right. It’s the fourth night. The tide’s not due back for five days.”

“I know what the tables say.” Tobiah wiped his arm on his coat. “I’m telling you what the water says.”
''',
  ),
  (
    title: 'A Night on the Causeway',
    summary:
        'Fog traps them in the wreck. Wren and Tobiah talk until morning; the channel has risen nearly to the road.',
    text: r'''
The fog came in on the fifth evening, while they were out past the lock stone, and it came all at once, like a door closing.

One moment Wren could see the tower of Old Merrow, nearer now, black against a sky the colour of pewter. The next there was nothing but white. White on every side. White so thick that when she held out her hand she could barely see her own fingers.

“Stop,” Tobiah said. “Don’t move.”

She stopped. She heard him come back along the rope, hand over hand, until he was standing beside her, close enough that she could feel the warmth of him through two coats.

“We can’t go on in this,” he said. “And we can’t go back. If we step off the road, we’ll never find it again.”

“The wreck,” Wren said. “We can wait in the wreck.”

It took them an hour to go two hundred paces, Wren reading the compass by touch, Tobiah feeling ahead with his boot for the edge of the paving. When they reached the black curve of the hull, they climbed in through the broken planking and sat down with their backs against the lock stone, and Tobiah opened the shutter of the lantern a crack.

Inside the hull it was almost cosy. The timbers kept off the worst of the damp. The light lay warm on the old stone and on Wren’s drawing board, and on Tobiah’s tired face.

They ate the bread and cheese Nan had sent with them. For a while neither of them said anything.

“Why do you want it so much?” Tobiah asked at last. “The map. It’s not the Guild’s money. You turned that down.”

Wren thought about it.

“When I was small,” she said, “my mother took me to see Ilse’s chart. Everybody did. I remember standing in front of it and thinking it was the most beautiful thing I’d ever seen. And then I saw the blank, and I thought, someone should finish that. Someone should go and see what’s there and draw it, so that nobody has to wonder any more.” She shrugged. “I was six. I thought it would be easy.”

“And now?”

“Now I think Ilse has been wondering every day for thirty-one years. I think the blank isn’t because she didn’t see. I think it’s because she did.”

Tobiah was quiet.

“My father drowned,” he said after a while, “when I was nine. Out past the harbour mouth, in a squall. The boat came back. He didn’t. Gran says the sea keeps what it likes.” He turned his cap in his hands. “I hate it, sometimes. The water. And I can’t stay away from it. Is that strange?”

“No,” Wren said. “That’s not strange at all.”

The lantern ticked. Outside, the fog pressed against the timbers, white and soft and blind.

At some point Wren fell asleep with her head on his shoulder. When she woke, the lantern had burned low and the fog had thinned to a grey haze, and Tobiah was still sitting exactly as he had been, as if he had not dared to move.

“Morning,” he said. His voice was rough.

“Morning.”

They looked at each other for a moment longer than they needed to. Then Wren sat up, and pushed back her hair, and reached for her drawing board, and Tobiah reached for the rope, and neither of them said anything about it at all.

When they climbed out of the wreck, the first thing Wren saw was the deep channel beside the road. Two days ago it had lain a yard below the paving.

This morning, the water in it was nearly level with the stone.
''',
  ),
  (
    title: 'Numbers in the Margin',
    summary:
        'Ilse’s numbers are the real tides: the sea comes back on the seventh day. The Guild’s crew is already out.',
    text: r'''
Wren laid the column of numbers on the chart table and, for the first time, she understood it.

She had been reading it wrong for five days. She had thought the dates were days of low water, and the times were times of the tide going out. But they were not. They were the times the water came back. And not by the Wardens’ tables. By Ilse’s own observations, made, Wren saw now, from the window of this very shop, year after year, ink after ink, with a cartographer’s patience: every tide of every month for thirty years, measured against the stone of the harbour wall.

Beside the last line, the old line with the deep cut, someone had written in tiny letters: Seventh day. Not ninth. They knew.

Wren sat down very suddenly on the stool.

She did the sums twice, then a third time, with Ilse’s tables open on one side and the Wardens’ printed notice on the other. The answer did not change. The Wardens’ tables said the sea would return on the ninth day. Ilse’s numbers said the seventh. And thirty-one years ago, it had come back on the seventh, two days early, and caught twelve people on the road.

Tomorrow was the seventh day.

“You found it, then.”

Ilse stood in the doorway. She had dressed, for the first time in days, in her old brown work coat, and her hair was pinned up. She looked smaller in it, and harder.

“Why didn’t you tell anyone?” Wren said. Her voice came out cracked. “Master, if you knew the tables were wrong—”

“I didn’t know. Not for years. Not for certain.” Ilse came in and felt for the edge of the table, and sat down across from her. “After Kit, I went to the Wardens. I said the sea came back early. They said I was a grieving girl who could not count. Their tables were three hundred years old and had never failed, they said, and the drowned had been careless. So I started counting.” She touched the column, lightly, with two fingers, as if it were warm. “It took me twenty years to be sure. By then nobody listened to me, and the sea had not gone out again. I told myself there was time.”

“There isn’t time. It’s tomorrow.”

“I know.”

“The Guild’s crew went out this morning.” Wren’s throat was tight. “I saw them from the shore. Twelve of them, with sledges. Sefa Quill went with them. They’ll be at Old Merrow by tonight. They think they have three days.”

Ilse said nothing for a long while. When she spoke, her voice was very quiet.

“They knew,” she said. “The Wardens. The Provost before Crane, and Crane after him. The real tables are kept in the tower. Doran found out, thirty-one years ago, the night before we went. He told Kit, and Kit thought there was still time if we were quick. He told me on the road, when it was already too late. They say nine days so that people think there is time to be careful, and they ring the bell so that everyone knows to stay away, and they say the road eats people, so that people will be afraid of the road.” Her mouth twisted. “And it works. Most years. Most people stay away.”

“That’s monstrous.”

“It is very sensible, if you are a Warden. Fear is cheaper than walls.”

Wren stood up. She did not decide to; she simply found herself standing, with her coat in her hand.

“Where are you going?”

“To the tower,” Wren said. “To get the real tables. And then to the road.”

Ilse turned her blind face toward her. For a moment Wren thought she would forbid it, as she had forbidden everything for six years. Instead, she reached into the pocket of her work coat and took out something small and bright, and held it out on her open palm.

It was a brass compass, very old, its case worn smooth.

“Kit’s,” she said. “He left it on the shore that morning, because he forgot it. He always forgot things.” Her hand closed over Wren’s for a moment, hard. “Take it. And come back.”
''',
  ),
  (
    title: 'The Provost’s Table',
    summary:
        'Aldous Crane admits the Wardens’ lie and will not ring the bell. Wren takes the book of true tables and runs.',
    text: r'''
The Wardens’ tower stood at the top of the town, a square grey keep with the great bell hanging in its open crown. Wren had walked past it every day of her life and never been inside.

She went in through the front door, because she could not think of any other way.

The hall was cold and plain and smelled of lamp oil. A clerk at a high desk looked up, and opened his mouth, and Wren said, in the voice Ilse used on printers who had spoiled a plate, “I am here to see the Provost. Tell him it is about the tables.”

She was not sure it would work. But the clerk went pale, and went away, and after a while a door opened at the back of the hall and Aldous Crane stood in it.

He was tall and thin and very straight, as she had seen him on the cliff path, and older than she had thought, with a long grey face and long grey hands. He looked at her for a moment. Then he stood aside.

“Come up, Miss Hollis.”

His room was at the top of the tower, under the bell. Through the open arches of the crown she could see the whole bay laid out beneath them in the evening light: the emptied harbour, the long line of the road, and, very far off, the thin black finger of Old Merrow’s tower. Between the shore and the wheel stone, the deep channel showed as a ribbon of silver. It was wider than it had been that morning.

On the Provost’s desk, held open with a brass weight, lay a great leather book.

“You know, then,” Crane said. He did not sit. “Marrow worked it out. I always wondered whether she would.”

“The sea comes back on the seventh day.”

“The sea comes back between the sixth and the eighth day, depending on the wind. The seventh is likeliest.” He laid one long hand on the book. “The Wardens have known for two hundred years.”

“Then why—”

“Because if we said seven, people would plan for six. And they would go out on the fifth, thinking they had time, and the wind would turn, and we would lose them. If we say nine, and ring the bell, and tell them the road eats people, most of them stay home.” His face did not change. “Most of them, Miss Hollis. That is the job. Not all of them. Most.”

“Eleven people died last time.”

“Eleven people who ignored a direct order.”

“Kit Marrow was seventeen!”

For the first time, something moved in Crane’s face. It was gone almost at once.

“I was twenty-four,” he said. “I was the junior Warden on the bell. I rang it nine times nine, the way I was taught. I watched them go out the next morning, from this window, and I watched the water come back.” He looked out through the arch, at the silver ribbon in the bay. “I have thought about it every day since. I have never once thought the answer was to tell more people the truth.”

“There are twelve people on the road right now,” Wren said. “The Guild’s crew. They think they have three days. They’ll be in Old Merrow tonight, and when the sea comes back, they’ll be cut off at the wheel stone. Every one of them.”

Crane said nothing.

“You could ring the bell,” Wren said. “Now. Ring it, and they’ll know something’s wrong. They’ll turn back.”

“From Old Merrow they could not hear it. And in the town, if I ring the bell out of order, there will be a panic, and people will run down to the shore to see, and someone will go out after them.” He closed the book. “No.”

Wren looked at the closed book. She looked at the Provost’s long grey hand on top of it. And then, because she could think of nothing else to do, she did the thing Ilse had told her never to do in another person’s workroom: she snatched.

She got the book. She got halfway down the stair before Crane shouted for the clerks. She got out of the front door and into the lane and down the hill, with the book under her coat and Kit’s compass bumping against her chest, and she did not stop running until she reached the harbour wall below Hollow Light, where Tobiah was waiting with the rope.

“Well?” he said.

“Seventh day,” said Wren, gasping. “Maybe sooner. We have to go now.”
''',
  ),
  // --------------------------------------------------------------------------------------- Part Three: High Water
  (
    title: 'Sefa’s Crew',
    summary:
        'At the Guild’s camp by the wreck, Sefa believes the water, not the book, and turns back. Three of hers are missing.',
    text: r'''
They went out in the last of the light, faster than they had ever gone, Wren running ahead with her chart and Tobiah behind her with the rope paying out between them. Fish stone. Wheel stone. At the wheel, the deep channel was a river now, wide and dark and moving, lipping at the very edge of the paving.

“It’ll be over the road by morning,” Tobiah said. “Maybe sooner.”

“Then we’ll be back by morning.”

He didn’t answer. They ran.

They found the Guild’s camp just past the lock stone, in the lee of the great wreck: three tents, a fire of driftwood, sledges drawn up in a neat row. Sefa Quill was sitting by the fire with a chart on her knees. It was a copy of Ilse’s famous chart, Wren saw. It ended at the third stone, like the original.

Sefa looked up as they came into the light, and her face went from surprise to something like relief, and then, quickly, to business.

“Miss Hollis. Have you brought me a better map?”

“I’ve brought you this.” Wren dropped the Provost’s book on the sand beside the fire and opened it at the page she had marked. “The Wardens’ own tables. The real ones. The sea comes back tomorrow. Not in three days. Tomorrow. You have to go back now, tonight, before the channel at the wheel stone floods.”

Sefa read the page. She read it twice. Around the fire, her crew had gone quiet: big, weathered men and women, salvagers and haulers, who had all of them grown up in Vell and all of them heard about the last low water.

“This could be a forgery,” Sefa said at last.

“It isn’t.”

“It could be. Marrow has hated the Guild for thirty years. It would suit her very well to frighten us home empty-handed.” Sefa closed the book. Her hands, Wren noticed, were not quite steady. “We are two hours from Old Merrow. The warehouses are there. We have come all this way.”

“Sefa.” It was Tobiah, very quiet. “Come and look at the channel.”

She looked at him. She looked at Wren. Then she got up and followed him to the edge of the road, where the lantern showed the sand dropping away into the dark. It had been dry sand at dusk. Now it shone. As they watched, a thin sheet of water slid across it, silent and quick, and drew back, and slid across again, a little further.

Sefa stood very still.

“All right,” she said finally. She turned back to the fire, and her voice changed, and became the voice of the Guild’s factor. “Break camp. Leave the sledges. We go back now.”

There was a murmur, and then a scramble. Wren let out a breath she felt she had been holding for days.

Then a man came running in from the west, out of the dark beyond the wreck, his lantern swinging wildly.

“Factor!” he shouted. “Factor, it’s Jory and the twins. They went on ahead at sundown, to scout the town. They’re not back.”

Sefa’s face went white.

“How many?” Wren asked.

“Three,” said Sefa. “Three of mine. In Old Merrow.”

Out across the sand, from the dark where the bell tower stood, there was no sound at all.
''',
  ),
  (
    title: 'Old Merrow',
    summary:
        'Past the last stones to the drowned town. Jory is pulled from the crypt. At the top of the tower, Kit’s letters.',
    text: r'''
Sefa wanted to go herself. Tobiah would not let her.

“You know the way back,” he said. “Wren’s chart is good to here. Take your people home. Don’t stop at the wheel stone. Don’t stop for anything.” He looked at Wren. “We’ll get the three.”

“You don’t know the road past here,” Sefa said.

“Nobody knows the road past here,” Wren said. “That’s rather the point.”

So the Guild went east, toward the shore, a straggle of lanterns along the black line of the causeway. And Wren and Tobiah went west.

Past the wreck, the road was different. The paving was broken and heaved up in places, as if something huge had shouldered through it. The weed was so thick that they waded in it to the knee. Twice they had to leave the stones entirely and cross a stretch of sand where the causeway had simply sunk away, and both times Wren took the bearing on Kit’s compass and walked straight across in the dark, counting, with Tobiah’s hand on her shoulder, and both times the paving rose up again under her feet exactly where she had said it would.

The fifth stone had a ship on it. The sixth had a crown. Wren drew them both without stopping, by lantern light, on the run.

And then the tower was above them.

Old Merrow came up out of the night all at once, the way a face comes up out of dark water. First the tower, tall and square and broken at the top, its belfry open to the stars. Then, around it, the town: streets of grey stone houses with no roofs, doorways full of sand, windows full of weed. A market square with a dry fountain. A flight of steps leading up to nothing. Everything furred and crusted and silent, the way the sea had left it.

There was a stone in the middle of the square. Wren went to it, and held up the lantern, and saw the sign.

It was a bell.

“The seventh stone is waiting for you,” Tobiah said quietly.

They found the three salvagers in the church at the foot of the tower. Jory had fallen through a rotten floor into the crypt and broken his leg. The twins, a boy and a girl of perhaps sixteen, had been trying for hours to get him out, and had used up their lantern oil doing it, and when Wren and Tobiah came in with a light, the girl burst into tears.

It took both twins and Tobiah and the rope to lift Jory out. He bit his own sleeve to keep from screaming. Then he sat against the wall with his face grey and wet, and said, “Thank you,” over and over, until Tobiah told him to save his breath.

“We have to go,” Tobiah said to Wren, low. “Now. He can’t walk. We’ll carry him in turns. It’ll be slow.”

“I know.”

“Wren—”

“I know. One minute.”

She did not know why she did it. She would think about it for years afterwards, and never be quite sure. But she took the lantern and went across the church to the door of the tower, and up the stair.

The stair went round and round inside the walls, slick with weed. At the top, under the open sky, hung the bell of Old Merrow: huge and green with three hundred years of sea, its clapper still in place. And on the wall beside it, scratched into the stone with something sharp, there were letters.

She held up the lantern.

They were not old letters. They were not three hundred years old. They were rough and shallow and recent, as recent as thirty-one years, and they had been made by someone who knew how to cut letters, but was cold, and tired, and in a hurry.

ILSE, it said at the top.

Below it, there was more.

Wren read it once. Then she took out her drawing board, and her pencil, and a clean sheet of paper, and with hands that were perfectly steady, she copied every letter exactly as it was.

When she came down, Tobiah was waiting at the foot of the stair. He looked at her face and did not ask.
''',
  ),
  (
    title: 'What Kit Wrote',
    summary:
        'Kit’s message to his sister: the song is a map, and the bell was rung for help. Then the sea begins to come back.',
    text: r'''
ILSE.

I made it to the tower. The water came at the wheel stone, as Doran said it might. The others went back for the shore. I did not think I could make it, so I came on. I have food for a day and the stars to look at.

I have counted the stones. There are seven. The seventh is in the square and has a bell on it, like the one above me. I think the song is a map. I think the last line means: when you reach the seventh stone, ring the bell, and someone on the shore will hear and know you are safe, and come for you. I think they used to do that, when there was a town here.

I have rung it every hour since sunset. I do not think anyone can hear it over the sea.

Don’t leave the map blank on my account. Finish it. Put the stones on it. Put the bell on it. Then the next ones will know.

I am not afraid. It is very beautiful up here.

Your brother, Kit.

That was all.

Wren read it out loud to Tobiah, in the church at the foot of the tower, while the twins sat with Jory and the lantern hissed. She read it quietly, and her voice held until the last line, and then it did not.

Tobiah put his hand over hers on the drawing board.

“She never came,” Wren said. “She never knew. They told her he was drowned with the others, and she believed them, and she never came back.”

“She was nineteen,” Tobiah said. “And the sea didn’t go out again.”

“She could have known.” Wren wiped her face with the back of her hand. “All this time. If anyone had come out here and looked.”

“Someone did,” Tobiah said. “You did.”

Outside, something had changed. It took Wren a moment to understand what it was. It was a sound: a low, steady whisper from the east, like wind through a field of barley, though there was no wind.

Tobiah was on his feet before she was. He went to the church door and stood in it, looking out, and when he turned back his face was quite calm, in the way that faces are calm when there is no longer any point in being anything else.

“That’s the sea,” he said. “It’s coming back.”
''',
  ),
  (
    title: 'Ring It',
    summary:
        'They climb the tower and ring Merrow’s bell all night. Ilse hears it, and the Guild and the ferries come for them.',
    text: r'''
They could not outrun it. Tobiah knew it, and Wren knew it, and Jory knew it best of all, lying grey-faced on a door they had pulled off its hinges to carry him on.

“Leave me,” Jory said. “Take the twins. Go.”

“Be quiet,” said Wren.

She was thinking. She was thinking harder than she had ever thought in her life, harder than at any chart table, with the whisper of the sea growing louder in the east and the lantern beginning to gutter.

Kit had rung the bell every hour. Nobody had heard. But Kit had been alone, and it had been night, and nobody on the shore had been listening for anything from Old Merrow, because everybody knew the road ate people.

Tonight there were people on the road who knew the bell was a map. Sefa Quill was out there. Sefa, who had the Guild’s boats. And on the shore, in a shop on Lantern Street, there was a half-blind woman who had been listening to this bay for thirty-one years.

“Tobiah,” Wren said. “Get them to the top of the tower. All of them. Jory too.”

“The tower?”

“It’s the highest thing for five miles. Kit lived up there long enough to write a letter. It will be long enough for us.” She was already at the stair. “And I’m going to ring the bell.”

She rang it.

She had never rung a bell in her life. It was harder than it looked. The clapper was heavy as an anchor and stiff with three hundred years of salt, and the first time she hauled on the rope nothing happened at all. The second time, it moved. The third time, it struck.

The sound went out over the bay like a great green wave.

It was not a sweet sound. It was cracked and hoarse and enormous, and it shook the stones of the tower and her own bones inside her, and it rolled away east across the sand and the rising water toward the far lamp of Hollow Light. She hauled on the rope again. And again.

Behind her, Tobiah came up the stair with Jory over his shoulder, and the twins after him. They crouched together under the bell, and the twins put their hands over their ears, and Wren rang, and rang, and rang.

Below them, the sea came into Old Merrow.

It came quietly at first, a sheet of water sliding across the square, round the bell stone, through the doorways. Then faster. Then it was knee-deep in the streets, and moving, and the dry fountain filled and overflowed, and the steps that led up to nothing went under one by one.

Wren rang until her hands bled. Then Tobiah took the rope from her and rang, and then the twins together, and then Wren again.

The water climbed the tower. It filled the church. It reached the bottom of the stair, and then the middle, and Wren stopped counting the steps it covered, because counting did not help.

And then, out in the dark to the east, a light.

Then another. Then three, four, a whole line of them, low on the water, coming on. Not lanterns on a road. Lanterns on boats.

“The Guild,” Tobiah said. His voice cracked. “That’s the Guild’s boats. And that—” He pointed. At the head of the line, a smaller light, moving faster than the rest. “That’s a ferry. That’s one of ours.”

The first boat bumped against the tower an hour before dawn. Sefa Quill was in the bow, soaked to the skin and furious, with a boathook in her hands.

“Your master,” she shouted up, over the noise of the water, “is the most unbearable woman in Vell. She was waiting at the harbour wall when we got back. She had heard the bell. Not the Wardens’ bell. Yours. She said, that is Merrow’s bell, that is the seventh stone, they are at the tower, and she would not stop saying it until I gave her a boat.”

“She’s here?” Wren said.

“She’s in the ferry,” said Sefa. “With your grandmother, Fenn. They are both of them out of their minds. Get down here.”
''',
  ),
  (
    title: 'The Full Map',
    summary:
        'Spring: the finished chart, signed by three; the true tables posted; the Guild’s new rule. The last verse.',
    text: r'''
The Bay at Low Water was printed again in the spring.

It was not quite the same chart. The old one, the famous one, still hung in its frame behind the counter of the shop on Lantern Street, and people still came from three cities to look at it. But beside it, now, hung another: larger, and finer, and finished.

The Drowned Road ran across it from Hollow Light to Old Merrow, every slab and every gap marked, every bend and bearing. The deep channel at the wheel stone was drawn in blue, with a note beside it in small careful letters: Floods first. Do not be west of this stone after the fifth day. The seven stones stood along the road in their places, each with its sign drawn true: fish, wheel, key, lock, ship, crown, bell. And at the end of the road, where the old chart had been blank, was the drowned town, its streets and its square and its tower, drawn from a hundred pages of notes made in the dark.

In the bottom corner, where a cartographer signs, there were three names.

Ilse Marrow. Wren Hollis. Kit Marrow.

“He drew more of it than I did,” Ilse had said, when Wren protested. “He counted the stones. He worked out the bell. Put his name on it.”

So Wren had.

The Wardens’ true tables were printed too, that spring, on a single sheet nailed to the door of every chapel and tavern in Vell: the sea returns between the sixth and eighth day; the seventh is likeliest. It was signed by the new Provost. Aldous Crane had resigned in the winter. He had come to the shop once, before he left the town, and stood in front of the old chart for a long time, and said nothing to anyone, and gone. Wren did not know whether he had come to apologise. She thought, perhaps, he had come to look at the blank, and found it filled.

The Salt Guild had its salvage rights. It had also, at Sefa Quill’s insistence, a new rule written into its charter: no crew would go west of the wheel stone after the fourth day of any low water, for any warehouse, at any price. Sefa had sent Wren two hundred crowns anyway, with a note that said only: For the chart. It was good.

Wren had used it to buy a press.

On the last evening of spring, she and Tobiah walked out along the harbour wall to the foot of Hollow Light, where the old road went down into the sea. The tide was high. The road was gone, a hundred feet down under green water, and would be gone for another thirty-one years.

“Will you go out next time?” Tobiah asked.

“I’ll be fifty.”

“That’s not an answer.”

Wren laughed. “Yes. Of course I will. Will you?”

“Somebody who knows the water had better.” He took her hand, quite naturally, as if he had been doing it for years. “Gran’s teaching the twins the whole song. All the verses. She says she remembered the rest of it, that night in the boat.”

“What does the last verse say?”

He thought about it, and then sang, badly, in a voice that cracked on the high note exactly like his grandmother’s:

Ring the bell, girl, ring it true,

The ones on the shore are listening for you.

They stood together at the end of the wall, and listened to the sea, and far out across the water, too faint to be sure of, to something that might have been a bell.
''',
  ),
];
