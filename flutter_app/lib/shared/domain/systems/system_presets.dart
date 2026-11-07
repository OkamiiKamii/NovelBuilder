// GENERATED from the original app's `systems/presets.ts` by `tool/golden/growth.test.ts` (system_presets.json).
// Do not edit by hand: regenerate, so the presets stay the original's.
import 'dart:convert';

import '../json.dart';

/// A ready-made blueprint to start a system from: its content gets fresh ids when a novel uses it.
typedef SystemPreset = ({String id, String name, String description, JsonMap content});

/// The original app's four system presets: LitRPG, cultivation, hard magic, superheroes.
final List<SystemPreset> systemPresets = [
  for (final p in maps(jsonDecode(_presets)))
    (id: str(p['id']), name: str(p['name']), description: str(p['description']), content: mapOrNull(p['content'])!),
];

/// An empty blueprint.
const JsonMap blankBlueprint = {
  'name': 'New system',
  'description': '',
  'variables': <Object?>[],
  'tracks': <Object?>[],
  'ranks': <Object?>[],
  'groups': <Object?>[],
  'items': <Object?>[],
  'matrices': <Object?>[],
};

const _presets = r'''[
 {
  "id": "litrpg",
  "name": "LitRPG / Game System",
  "description": "Stat sheet, a level curve fed by logged experience, points to place each level, a class tree and ranked skills with costs and cooldowns.",
  "content": {
   "name": "The System",
   "description": "A game-like system: stats grow with levels, a class shapes them, and skills spend mana or stamina.",
   "variables": [
    {
     "id": "v-strength",
     "name": "Strength",
     "key": "strength",
     "kind": "number",
     "unit": "",
     "base": 10,
     "formula": "",
     "options": [],
     "note": ""
    },
    {
     "id": "v-agility",
     "name": "Agility",
     "key": "agility",
     "kind": "number",
     "unit": "",
     "base": 10,
     "formula": "",
     "options": [],
     "note": ""
    },
    {
     "id": "v-intelligence",
     "name": "Intelligence",
     "key": "intelligence",
     "kind": "number",
     "unit": "",
     "base": 10,
     "formula": "",
     "options": [],
     "note": ""
    },
    {
     "id": "v-vitality",
     "name": "Vitality",
     "key": "vitality",
     "kind": "number",
     "unit": "",
     "base": 10,
     "formula": "",
     "options": [],
     "note": ""
    },
    {
     "id": "v-health",
     "name": "Health",
     "key": "health",
     "kind": "resource",
     "unit": "HP",
     "base": 100,
     "formula": "",
     "options": [],
     "note": ""
    },
    {
     "id": "v-mana",
     "name": "Mana",
     "key": "mana",
     "kind": "resource",
     "unit": "MP",
     "base": 50,
     "formula": "",
     "options": [],
     "note": ""
    },
    {
     "id": "v-stamina",
     "name": "Stamina",
     "key": "stamina",
     "kind": "resource",
     "unit": "SP",
     "base": 100,
     "formula": "",
     "options": [],
     "note": ""
    },
    {
     "id": "v-max_health",
     "name": "Max Health",
     "key": "max_health",
     "kind": "derived",
     "unit": "HP",
     "base": 0,
     "formula": "health + vitality * 10",
     "options": [],
     "note": ""
    },
    {
     "id": "v-max_mana",
     "name": "Max Mana",
     "key": "max_mana",
     "kind": "derived",
     "unit": "MP",
     "base": 0,
     "formula": "mana + intelligence * 5",
     "options": [],
     "note": ""
    },
    {
     "id": "v-damage",
     "name": "Damage",
     "key": "damage",
     "kind": "derived",
     "unit": "",
     "base": 0,
     "formula": "strength * 1.5",
     "options": [],
     "note": "Base melee damage."
    },
    {
     "id": "v-mana_regen",
     "name": "Mana Regen",
     "key": "mana_regen",
     "kind": "derived",
     "unit": "per minute",
     "base": 0,
     "formula": "intelligence / 10",
     "options": [],
     "note": ""
    },
    {
     "id": "v-skill_slots",
     "name": "Skill Slots",
     "key": "skill_slots",
     "kind": "derived",
     "unit": "slots",
     "base": 0,
     "formula": "3 + floor(level / 10)",
     "options": [],
     "note": ""
    }
   ],
   "tracks": [
    {
     "id": "t-level",
     "name": "Level",
     "key": "level",
     "kind": "levels",
     "cap": 100,
     "curve": "100 * level ^ 1.5",
     "curveUnit": "XP",
     "points": 3,
     "sources": [
      "Combat",
      "Quest",
      "Discovery",
      "Training"
     ],
     "stages": []
    }
   ],
   "ranks": [
    {
     "id": "r-common",
     "name": "Common"
    },
    {
     "id": "r-advanced",
     "name": "Advanced"
    },
    {
     "id": "r-unique",
     "name": "Unique"
    },
    {
     "id": "r-legendary",
     "name": "Legendary"
    }
   ],
   "groups": [
    {
     "id": "g-classes",
     "name": "Classes",
     "single": true
    },
    {
     "id": "g-skills",
     "name": "Skills",
     "single": false
    },
    {
     "id": "g-titles",
     "name": "Titles",
     "single": false
    }
   ],
   "items": [
    {
     "id": "i-warrior",
     "groupId": "g-classes",
     "name": "Warrior",
     "description": "Front-line fighter.",
     "parentId": null,
     "rankId": null,
     "requires": "",
     "modifiers": [
      {
       "id": "m-strength-add-5",
       "target": "strength",
       "op": "add",
       "value": "5"
      },
      {
       "id": "m-vitality-add-3",
       "target": "vitality",
       "op": "add",
       "value": "3"
      }
     ],
     "costs": [],
     "cooldown": "",
     "affinity": "",
     "evolution": ""
    },
    {
     "id": "i-mage",
     "groupId": "g-classes",
     "name": "Mage",
     "description": "Shapes mana into spells.",
     "parentId": null,
     "rankId": null,
     "requires": "",
     "modifiers": [
      {
       "id": "m-intelligence-add-6",
       "target": "intelligence",
       "op": "add",
       "value": "6"
      },
      {
       "id": "m-mana-add-40",
       "target": "mana",
       "op": "add",
       "value": "40"
      }
     ],
     "costs": [],
     "cooldown": "",
     "affinity": "",
     "evolution": ""
    },
    {
     "id": "i-void_mage",
     "groupId": "g-classes",
     "name": "Void Mage",
     "description": "A mage who has touched the space between.",
     "parentId": "i-mage",
     "rankId": null,
     "requires": "Class: Mage AND level >= 25",
     "modifiers": [
      {
       "id": "m-intelligence-add-12",
       "target": "intelligence",
       "op": "add",
       "value": "12"
      },
      {
       "id": "m-mana-multiply-2",
       "target": "mana",
       "op": "multiply",
       "value": "2"
      }
     ],
     "costs": [],
     "cooldown": "",
     "affinity": "",
     "evolution": "Evolves from Mage at level 25."
    },
    {
     "id": "i-power_strike",
     "groupId": "g-skills",
     "name": "Power Strike",
     "description": "",
     "parentId": null,
     "rankId": "r-common",
     "requires": "",
     "modifiers": [],
     "costs": [
      {
       "id": "c-stamina",
       "target": "stamina",
       "amount": "15"
      }
     ],
     "cooldown": "10 seconds",
     "affinity": "Physical",
     "evolution": ""
    },
    {
     "id": "i-fireball",
     "groupId": "g-skills",
     "name": "Fireball",
     "description": "",
     "parentId": null,
     "rankId": "r-advanced",
     "requires": "intelligence >= 15",
     "modifiers": [],
     "costs": [
      {
       "id": "c-mana",
       "target": "mana",
       "amount": "20"
      }
     ],
     "cooldown": "5 seconds",
     "affinity": "Fire",
     "evolution": "Becomes Inferno after 1,000 casts."
    },
    {
     "id": "i-void_step",
     "groupId": "g-skills",
     "name": "Void Step",
     "description": "",
     "parentId": null,
     "rankId": "r-unique",
     "requires": "Class: Void Mage AND level >= 50",
     "modifiers": [],
     "costs": [
      {
       "id": "c-mana",
       "target": "mana",
       "amount": "40 + level"
      }
     ],
     "cooldown": "30 seconds",
     "affinity": "Void",
     "evolution": ""
    },
    {
     "id": "i-giant_slayer",
     "groupId": "g-titles",
     "name": "Giant Slayer",
     "description": "Passive: for felling something ten levels above you.",
     "parentId": null,
     "rankId": "r-unique",
     "requires": "",
     "modifiers": [
      {
       "id": "m-damage-multiply-1_1",
       "target": "damage",
       "op": "multiply",
       "value": "1.1"
      }
     ],
     "costs": [],
     "cooldown": "",
     "affinity": "",
     "evolution": ""
    }
   ],
   "matrices": []
  }
 },
 {
  "id": "cultivation",
  "name": "Progression / Cultivation",
  "description": "Realms with bottlenecks and breakthrough conditions, qi reserves, techniques, pills and artifacts.",
  "content": {
   "name": "The Path of Cultivation",
   "description": "Cultivators gather qi, refine it, and break through realm by realm. Each breakthrough has a price.",
   "variables": [
    {
     "id": "v-qi",
     "name": "Qi",
     "key": "qi",
     "kind": "resource",
     "unit": "qi",
     "base": 100,
     "formula": "",
     "options": [],
     "note": "How much qi the dantian holds."
    },
    {
     "id": "v-comprehension",
     "name": "Comprehension",
     "key": "comprehension",
     "kind": "number",
     "unit": "",
     "base": 5,
     "formula": "",
     "options": [],
     "note": ""
    },
    {
     "id": "v-body_tempering",
     "name": "Body Tempering",
     "key": "body_tempering",
     "kind": "number",
     "unit": "layers",
     "base": 1,
     "formula": "",
     "options": [],
     "note": ""
    },
    {
     "id": "v-spirit_root_purity",
     "name": "Spirit Root Purity",
     "key": "spirit_root_purity",
     "kind": "number",
     "unit": "%",
     "base": 40,
     "formula": "",
     "options": [],
     "note": ""
    },
    {
     "id": "v-spirit_root",
     "name": "Spirit Root",
     "key": "spirit_root",
     "kind": "choice",
     "unit": "",
     "base": 0,
     "formula": "",
     "options": [
      "Metal",
      "Wood",
      "Water",
      "Fire",
      "Earth",
      "Heavenly"
     ],
     "note": ""
    },
    {
     "id": "v-qi_capacity",
     "name": "Qi Capacity",
     "key": "qi_capacity",
     "kind": "derived",
     "unit": "qi",
     "base": 0,
     "formula": "qi * cultivation_realm ^ 2",
     "options": [],
     "note": ""
    },
    {
     "id": "v-cultivation_speed",
     "name": "Cultivation Speed",
     "key": "cultivation_speed",
     "kind": "derived",
     "unit": "qi per day",
     "base": 0,
     "formula": "comprehension * spirit_root_purity / 100",
     "options": [],
     "note": ""
    },
    {
     "id": "v-lifespan",
     "name": "Lifespan",
     "key": "lifespan",
     "kind": "derived",
     "unit": "years",
     "base": 0,
     "formula": "80 * 2 ^ (cultivation_realm - 1)",
     "options": [],
     "note": ""
    }
   ],
   "tracks": [
    {
     "id": "t-cultivation_realm",
     "name": "Cultivation Realm",
     "key": "cultivation_realm",
     "kind": "stages",
     "cap": 0,
     "curve": "",
     "curveUnit": "",
     "stages": [
      {
       "id": "s-qi_condensation",
       "name": "Qi Condensation",
       "requires": "",
       "note": "Sensing qi and drawing it into the body."
      },
      {
       "id": "s-foundation_establishment",
       "name": "Foundation Establishment",
       "requires": "qi >= 1000 AND Pill: Foundation Pill",
       "note": "Bottleneck: most never cross it. The foundation, once laid, cannot be relaid."
      },
      {
       "id": "s-core_formation",
       "name": "Core Formation",
       "requires": "qi >= 10000 AND comprehension >= 20",
       "note": "Condensing qi into a golden core. Failure shatters the dantian."
      },
      {
       "id": "s-nascent_soul",
       "name": "Nascent Soul",
       "requires": "qi >= 100000 AND Technique: Soul Nurturing Art",
       "note": "Tribulation lightning must be survived."
      }
     ]
    }
   ],
   "ranks": [
    {
     "id": "r-mortal",
     "name": "Mortal"
    },
    {
     "id": "r-earth",
     "name": "Earth"
    },
    {
     "id": "r-heaven",
     "name": "Heaven"
    },
    {
     "id": "r-divine",
     "name": "Divine"
    }
   ],
   "groups": [
    {
     "id": "g-techniques",
     "name": "Techniques",
     "single": false
    },
    {
     "id": "g-pills",
     "name": "Pills",
     "single": false
    },
    {
     "id": "g-artifacts",
     "name": "Artifacts",
     "single": false
    },
    {
     "id": "g-sects",
     "name": "Sects",
     "single": true
    }
   ],
   "items": [
    {
     "id": "i-azure_breathing",
     "groupId": "g-techniques",
     "name": "Azure Breathing",
     "description": "A basic qi-gathering method.",
     "parentId": null,
     "rankId": "r-mortal",
     "requires": "",
     "modifiers": [
      {
       "id": "m-comprehension-add-2",
       "target": "comprehension",
       "op": "add",
       "value": "2"
      }
     ],
     "costs": [],
     "cooldown": "",
     "affinity": "",
     "evolution": ""
    },
    {
     "id": "i-soul_nurturing_art",
     "groupId": "g-techniques",
     "name": "Soul Nurturing Art",
     "description": "",
     "parentId": null,
     "rankId": "r-heaven",
     "requires": "Cultivation Realm: Core Formation",
     "modifiers": [],
     "costs": [
      {
       "id": "c-qi",
       "target": "qi",
       "amount": "500"
      }
     ],
     "cooldown": "",
     "affinity": "",
     "evolution": "Completes at Nascent Soul."
    },
    {
     "id": "i-foundation_pill",
     "groupId": "g-pills",
     "name": "Foundation Pill",
     "description": "Steadies the meridians for the first breakthrough. One use.",
     "parentId": null,
     "rankId": "r-earth",
     "requires": "",
     "modifiers": [],
     "costs": [],
     "cooldown": "",
     "affinity": "",
     "evolution": ""
    },
    {
     "id": "i-qi_gathering_pill",
     "groupId": "g-pills",
     "name": "Qi Gathering Pill",
     "description": "",
     "parentId": null,
     "rankId": "r-mortal",
     "requires": "",
     "modifiers": [
      {
       "id": "m-qi-add-200",
       "target": "qi",
       "op": "add",
       "value": "200"
      }
     ],
     "costs": [],
     "cooldown": "",
     "affinity": "",
     "evolution": ""
    },
    {
     "id": "i-spirit_sword",
     "groupId": "g-artifacts",
     "name": "Spirit Sword",
     "description": "",
     "parentId": null,
     "rankId": "r-earth",
     "requires": "cultivation_realm >= 2",
     "modifiers": [],
     "costs": [
      {
       "id": "c-qi",
       "target": "qi",
       "amount": "50"
      }
     ],
     "cooldown": "",
     "affinity": "Metal",
     "evolution": ""
    },
    {
     "id": "i-azure_cloud_sect",
     "groupId": "g-sects",
     "name": "Azure Cloud Sect",
     "description": "An orthodox sect of the eastern ranges.",
     "parentId": null,
     "rankId": null,
     "requires": "",
     "modifiers": [],
     "costs": [],
     "cooldown": "",
     "affinity": "",
     "evolution": ""
    }
   ],
   "matrices": []
  }
 },
 {
  "id": "hard-magic",
  "name": "Hard Magic / Elemental",
  "description": "Mana capacity, casting costs, an elemental interaction chart and limits on what can be cast.",
  "content": {
   "name": "The Elemental Art",
   "description": "Magic with firm rules: every spell draws on capacity, every element answers to another, and chants cannot be skipped.",
   "variables": [
    {
     "id": "v-mana_capacity",
     "name": "Mana Capacity",
     "key": "mana_capacity",
     "kind": "resource",
     "unit": "motes",
     "base": 100,
     "formula": "",
     "options": [],
     "note": ""
    },
    {
     "id": "v-control",
     "name": "Control",
     "key": "control",
     "kind": "number",
     "unit": "",
     "base": 10,
     "formula": "",
     "options": [],
     "note": ""
    },
    {
     "id": "v-chant_speed",
     "name": "Chant Speed",
     "key": "chant_speed",
     "kind": "number",
     "unit": "lines per breath",
     "base": 1,
     "formula": "",
     "options": [],
     "note": ""
    },
    {
     "id": "v-affinity",
     "name": "Affinity",
     "key": "affinity",
     "kind": "choice",
     "unit": "",
     "base": 0,
     "formula": "",
     "options": [
      "Fire",
      "Water",
      "Earth",
      "Air"
     ],
     "note": ""
    },
    {
     "id": "v-casting_efficiency",
     "name": "Casting Efficiency",
     "key": "casting_efficiency",
     "kind": "derived",
     "unit": "",
     "base": 0,
     "formula": "min(1, control / 50)",
     "options": [],
     "note": "1 means no mana is wasted."
    },
    {
     "id": "v-spells_before_exhaustion",
     "name": "Spells Before Exhaustion",
     "key": "spells_before_exhaustion",
     "kind": "derived",
     "unit": "spells",
     "base": 0,
     "formula": "floor(mana_capacity / 20)",
     "options": [],
     "note": ""
    }
   ],
   "tracks": [
    {
     "id": "t-circle",
     "name": "Circle",
     "key": "circle",
     "kind": "stages",
     "cap": 0,
     "curve": "",
     "curveUnit": "",
     "stages": [
      {
       "id": "s-first_circle",
       "name": "First Circle",
       "requires": "",
       "note": ""
      },
      {
       "id": "s-second_circle",
       "name": "Second Circle",
       "requires": "control >= 20",
       "note": ""
      },
      {
       "id": "s-third_circle",
       "name": "Third Circle",
       "requires": "control >= 35 AND mana_capacity >= 300",
       "note": ""
      },
      {
       "id": "s-archmage",
       "name": "Archmage",
       "requires": "control >= 50",
       "note": "Granted by the Conclave, never claimed."
      }
     ]
    }
   ],
   "ranks": [
    {
     "id": "r-cantrip",
     "name": "Cantrip"
    },
    {
     "id": "r-lesser",
     "name": "Lesser"
    },
    {
     "id": "r-greater",
     "name": "Greater"
    },
    {
     "id": "r-grand",
     "name": "Grand"
    }
   ],
   "groups": [
    {
     "id": "g-spells",
     "name": "Spells",
     "single": false
    },
    {
     "id": "g-restrictions",
     "name": "Restrictions",
     "single": false
    }
   ],
   "items": [
    {
     "id": "i-ember",
     "groupId": "g-spells",
     "name": "Ember",
     "description": "",
     "parentId": null,
     "rankId": "r-cantrip",
     "requires": "",
     "modifiers": [],
     "costs": [
      {
       "id": "c-mana_capacity",
       "target": "mana_capacity",
       "amount": "5"
      }
     ],
     "cooldown": "One line of chant",
     "affinity": "Fire",
     "evolution": ""
    },
    {
     "id": "i-flame_lance",
     "groupId": "g-spells",
     "name": "Flame Lance",
     "description": "",
     "parentId": null,
     "rankId": "r-lesser",
     "requires": "Affinity: Fire AND circle >= 2",
     "modifiers": [],
     "costs": [
      {
       "id": "c-mana_capacity",
       "target": "mana_capacity",
       "amount": "20 / casting_efficiency"
      }
     ],
     "cooldown": "Three lines of chant",
     "affinity": "Fire",
     "evolution": ""
    },
    {
     "id": "i-tidewall",
     "groupId": "g-spells",
     "name": "Tidewall",
     "description": "",
     "parentId": null,
     "rankId": "r-greater",
     "requires": "Affinity: Water AND circle >= 3",
     "modifiers": [],
     "costs": [
      {
       "id": "c-mana_capacity",
       "target": "mana_capacity",
       "amount": "60"
      }
     ],
     "cooldown": "A full verse",
     "affinity": "Water",
     "evolution": ""
    },
    {
     "id": "i-spoken_chant",
     "groupId": "g-restrictions",
     "name": "Spoken Chant",
     "description": "A spell must be spoken aloud. A gagged mage cannot cast.",
     "parentId": null,
     "rankId": null,
     "requires": "",
     "modifiers": [],
     "costs": [],
     "cooldown": "",
     "affinity": "",
     "evolution": ""
    },
    {
     "id": "i-opposed_element",
     "groupId": "g-restrictions",
     "name": "Opposed Element",
     "description": "A mage cannot cast the element opposed to their affinity.",
     "parentId": null,
     "rankId": null,
     "requires": "",
     "modifiers": [],
     "costs": [],
     "cooldown": "",
     "affinity": "",
     "evolution": ""
    }
   ],
   "matrices": [
    {
     "id": "x-elemental_interactions",
     "name": "Elemental interactions",
     "rows": [
      {
       "id": "l-fire",
       "name": "Fire"
      },
      {
       "id": "l-water",
       "name": "Water"
      },
      {
       "id": "l-earth",
       "name": "Earth"
      },
      {
       "id": "l-air",
       "name": "Air"
      }
     ],
     "columns": [
      {
       "id": "l-fire",
       "name": "Fire"
      },
      {
       "id": "l-water",
       "name": "Water"
      },
      {
       "id": "l-earth",
       "name": "Earth"
      },
      {
       "id": "l-air",
       "name": "Air"
      }
     ],
     "cells": {
      "l-fire|l-water": "Quenched",
      "l-fire|l-earth": "Scorches",
      "l-fire|l-air": "Fed",
      "l-water|l-fire": "Douses",
      "l-water|l-earth": "Erodes",
      "l-water|l-air": "Scattered",
      "l-earth|l-fire": "Smothers",
      "l-earth|l-water": "Dams",
      "l-earth|l-air": "Unmoved",
      "l-air|l-fire": "Fans",
      "l-air|l-water": "Whips",
      "l-air|l-earth": "Wears down"
     }
    }
   ]
  }
 },
 {
  "id": "superhero",
  "name": "Superhero / Mutant",
  "description": "Power origins and triggers, drawbacks, and a tier ranking.",
  "content": {
   "name": "The Gifted",
   "description": "Powers come from somewhere, cost something, and are ranked by the people who fear them.",
   "variables": [
    {
     "id": "v-power_output",
     "name": "Power Output",
     "key": "power_output",
     "kind": "number",
     "unit": "kilojoules",
     "base": 10,
     "formula": "",
     "options": [],
     "note": ""
    },
    {
     "id": "v-control",
     "name": "Control",
     "key": "control",
     "kind": "number",
     "unit": "",
     "base": 5,
     "formula": "",
     "options": [],
     "note": ""
    },
    {
     "id": "v-endurance",
     "name": "Endurance",
     "key": "endurance",
     "kind": "resource",
     "unit": "minutes",
     "base": 100,
     "formula": "",
     "options": [],
     "note": ""
    },
    {
     "id": "v-gene_stability",
     "name": "Gene Stability",
     "key": "gene_stability",
     "kind": "number",
     "unit": "%",
     "base": 80,
     "formula": "",
     "options": [],
     "note": ""
    },
    {
     "id": "v-origin",
     "name": "Origin",
     "key": "origin",
     "kind": "choice",
     "unit": "",
     "base": 0,
     "formula": "",
     "options": [
      "Mutation",
      "Radiation",
      "Experiment",
      "Artifact",
      "Inherited"
     ],
     "note": ""
    },
    {
     "id": "v-threat_score",
     "name": "Threat Score",
     "key": "threat_score",
     "kind": "derived",
     "unit": "",
     "base": 0,
     "formula": "power_output * control / 10",
     "options": [],
     "note": ""
    },
    {
     "id": "v-burnout_risk",
     "name": "Burnout Risk",
     "key": "burnout_risk",
     "kind": "derived",
     "unit": "%",
     "base": 0,
     "formula": "max(0, 100 - gene_stability)",
     "options": [],
     "note": ""
    }
   ],
   "tracks": [
    {
     "id": "t-threat_tier",
     "name": "Threat Tier",
     "key": "threat_tier",
     "kind": "stages",
     "cap": 0,
     "curve": "",
     "curveUnit": "",
     "stages": [
      {
       "id": "s-delta",
       "name": "Delta",
       "requires": "",
       "note": "Street level."
      },
      {
       "id": "s-gamma",
       "name": "Gamma",
       "requires": "threat_score >= 20",
       "note": ""
      },
      {
       "id": "s-beta",
       "name": "Beta",
       "requires": "threat_score >= 100",
       "note": ""
      },
      {
       "id": "s-alpha",
       "name": "Alpha",
       "requires": "threat_score >= 500",
       "note": "City-level. Registered and watched."
      },
      {
       "id": "s-omega",
       "name": "Omega",
       "requires": "threat_score >= 5000",
       "note": "There have been three."
      }
     ]
    }
   ],
   "ranks": [
    {
     "id": "r-minor",
     "name": "Minor"
    },
    {
     "id": "r-major",
     "name": "Major"
    },
    {
     "id": "r-signature",
     "name": "Signature"
    }
   ],
   "groups": [
    {
     "id": "g-powers",
     "name": "Powers",
     "single": false
    },
    {
     "id": "g-triggers",
     "name": "Triggers",
     "single": false
    },
    {
     "id": "g-drawbacks",
     "name": "Drawbacks",
     "single": false
    }
   ],
   "items": [
    {
     "id": "i-kinetic_absorption",
     "groupId": "g-powers",
     "name": "Kinetic Absorption",
     "description": "Stores the force of impacts.",
     "parentId": null,
     "rankId": "r-major",
     "requires": "",
     "modifiers": [
      {
       "id": "m-power_output-add-40",
       "target": "power_output",
       "op": "add",
       "value": "40"
      }
     ],
     "costs": [
      {
       "id": "c-endurance",
       "target": "endurance",
       "amount": "5"
      }
     ],
     "cooldown": "",
     "affinity": "",
     "evolution": ""
    },
    {
     "id": "i-kinetic_release",
     "groupId": "g-powers",
     "name": "Kinetic Release",
     "description": "",
     "parentId": "i-kinetic_absorption",
     "rankId": "r-signature",
     "requires": "Power: Kinetic Absorption AND control >= 8",
     "modifiers": [],
     "costs": [
      {
       "id": "c-endurance",
       "target": "endurance",
       "amount": "20"
      }
     ],
     "cooldown": "Until recharged by impact",
     "affinity": "",
     "evolution": "Unlocks once absorption is mastered."
    },
    {
     "id": "i-gamma_exposure",
     "groupId": "g-triggers",
     "name": "Gamma Exposure",
     "description": "Powers surfaced after exposure to the reactor leak.",
     "parentId": null,
     "rankId": null,
     "requires": "Origin: Radiation",
     "modifiers": [],
     "costs": [],
     "cooldown": "",
     "affinity": "",
     "evolution": ""
    },
    {
     "id": "i-adrenal_surge",
     "groupId": "g-triggers",
     "name": "Adrenal Surge",
     "description": "Powers only wake under mortal threat.",
     "parentId": null,
     "rankId": null,
     "requires": "",
     "modifiers": [],
     "costs": [],
     "cooldown": "",
     "affinity": "",
     "evolution": ""
    },
    {
     "id": "i-cellular_burn",
     "groupId": "g-drawbacks",
     "name": "Cellular Burn",
     "description": "Every use ages the body.",
     "parentId": null,
     "rankId": null,
     "requires": "",
     "modifiers": [
      {
       "id": "m-gene_stability-add-15",
       "target": "gene_stability",
       "op": "add",
       "value": "-15"
      }
     ],
     "costs": [],
     "cooldown": "",
     "affinity": "",
     "evolution": ""
    },
    {
     "id": "i-tell",
     "groupId": "g-drawbacks",
     "name": "Tell",
     "description": "Eyes glow while the power is active. No hiding it.",
     "parentId": null,
     "rankId": null,
     "requires": "",
     "modifiers": [],
     "costs": [],
     "cooldown": "",
     "affinity": "",
     "evolution": ""
    }
   ],
   "matrices": []
  }
 }
]''';
