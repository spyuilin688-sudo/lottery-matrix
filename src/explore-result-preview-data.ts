export interface PreviewDrawRow {
  issue: string;
  numbers: string[];
  special?: string;
  source?: string;
  step?: string;
  hit?: string;
}

export interface PreviewValidationGroup {
  rows: PreviewDrawRow[];
  formulas: string[];
}

export interface PreviewResult {
  id: string;
  position: number;
  number: string;
  predictionPeriod: number;
  consecutive: string;
  prediction: string;
  algorithmType: string;
  numberOrder: string;
  summary: string;
  finalPrediction: string;
  groups: PreviewValidationGroup[];
}

export const PREVIEW_RESULTS: readonly PreviewResult[] = [
  {
    "algorithmType": "加減",
    "consecutive": "準6進7",
    "finalPrediction": "15、27",
    "groups": [
      {
        "formulas": [
          "第4顆 26+24 = 11",
          "［ 11 ］"
        ],
        "rows": [
          {
            "issue": "11847",
            "numbers": [
              "04",
              "06",
              "15",
              "26",
              "29"
            ],
            "source": "04",
            "step": "26"
          },
          {
            "hit": "11",
            "issue": "11848",
            "numbers": [
              "06",
              "11",
              "29",
              "34",
              "38"
            ]
          }
        ]
      },
      {
        "formulas": [
          "第4顆 27+24 = 12",
          "［ 12 ］"
        ],
        "rows": [
          {
            "issue": "11862",
            "numbers": [
              "04",
              "12",
              "19",
              "27",
              "33"
            ],
            "source": "04",
            "step": "27"
          },
          {
            "hit": "12",
            "issue": "11863",
            "numbers": [
              "12",
              "13",
              "21",
              "27",
              "28"
            ]
          }
        ]
      },
      {
        "formulas": [
          "第4顆 17+36 = 14",
          "［ 14 ］"
        ],
        "rows": [
          {
            "issue": "11869",
            "numbers": [
              "04",
              "12",
              "14",
              "17",
              "20"
            ],
            "source": "04",
            "step": "17"
          },
          {
            "hit": "14",
            "issue": "11870",
            "numbers": [
              "14",
              "16",
              "18",
              "24",
              "25"
            ]
          }
        ]
      },
      {
        "formulas": [
          "第4顆 37+36 = 34",
          "［ 34 ］"
        ],
        "rows": [
          {
            "issue": "11880",
            "numbers": [
              "04",
              "10",
              "35",
              "37",
              "39"
            ],
            "source": "04",
            "step": "37"
          },
          {
            "hit": "34",
            "issue": "11881",
            "numbers": [
              "08",
              "17",
              "28",
              "32",
              "34"
            ]
          }
        ]
      },
      {
        "formulas": [
          "第4顆 25+24 = 10",
          "［ 10 ］"
        ],
        "rows": [
          {
            "issue": "11889",
            "numbers": [
              "04",
              "07",
              "10",
              "25",
              "31"
            ],
            "source": "04",
            "step": "25"
          },
          {
            "hit": "10",
            "issue": "11890",
            "numbers": [
              "02",
              "08",
              "10",
              "23",
              "39"
            ]
          }
        ]
      },
      {
        "formulas": [
          "第4顆 37+24 = 22",
          "［ 22 ］"
        ],
        "rows": [
          {
            "issue": "11896",
            "numbers": [
              "04",
              "25",
              "31",
              "37",
              "39"
            ],
            "source": "04",
            "step": "37"
          },
          {
            "hit": "22",
            "issue": "11897",
            "numbers": [
              "02",
              "15",
              "22",
              "29",
              "33"
            ]
          }
        ]
      },
      {
        "formulas": [
          "第4顆 30+24 = 15",
          "第4顆 30+36 = 27"
        ],
        "rows": [
          {
            "issue": "11903",
            "numbers": [
              "04",
              "12",
              "29",
              "30",
              "39"
            ],
            "source": "04",
            "step": "30"
          }
        ]
      }
    ],
    "id": "result-04",
    "number": "04",
    "numberOrder": "順球",
    "position": 1,
    "prediction": "15.27",
    "predictionPeriod": 1,
    "summary": "開 04 第 1 顆  |  同期  |  第 4 顆  |  +24.36  |  下 1 期開"
  },
  {
    "algorithmType": "拖牌",
    "consecutive": "準7進8",
    "finalPrediction": "28、30",
    "groups": [
      {
        "formulas": [
          "第2顆 09+21 = 30",
          "［ 30 ］"
        ],
        "rows": [
          {
            "issue": "25073",
            "numbers": [
              "05",
              "09",
              "22",
              "33",
              "46",
              "47"
            ],
            "special": "36",
            "step": "09"
          },
          {
            "hit": "30",
            "issue": "25077",
            "numbers": [
              "05",
              "09",
              "12",
              "23",
              "30",
              "31"
            ],
            "special": "44"
          }
        ]
      },
      {
        "formulas": [
          "第2顆 09+19 = 28",
          "［ 28 ］"
        ],
        "rows": [
          {
            "issue": "25119",
            "numbers": [
              "07",
              "09",
              "16",
              "17",
              "33",
              "46"
            ],
            "special": "49",
            "step": "09"
          },
          {
            "hit": "28",
            "issue": "25123",
            "numbers": [
              "02",
              "04",
              "10",
              "23",
              "26",
              "28"
            ],
            "special": "36"
          }
        ]
      },
      {
        "formulas": [
          "第2顆 09+21 = 30",
          "［ 30 ］"
        ],
        "rows": [
          {
            "issue": "26009",
            "numbers": [
              "04",
              "09",
              "15",
              "24",
              "27",
              "31"
            ],
            "special": "45",
            "step": "09"
          },
          {
            "hit": "30",
            "issue": "26013",
            "numbers": [
              "25",
              "30",
              "32",
              "35",
              "36",
              "46"
            ],
            "special": "47"
          }
        ]
      },
      {
        "formulas": [
          "第2顆 09+19 = 28",
          "［ 28 ］"
        ],
        "rows": [
          {
            "issue": "26012",
            "numbers": [
              "06",
              "09",
              "12",
              "14",
              "35",
              "44"
            ],
            "special": "11",
            "step": "09"
          },
          {
            "hit": "28",
            "issue": "26016",
            "numbers": [
              "12",
              "20",
              "22",
              "28",
              "32",
              "37"
            ],
            "special": "44"
          }
        ]
      },
      {
        "formulas": [
          "第2顆 09+19 = 28",
          "［ 28 ］"
        ],
        "rows": [
          {
            "issue": "26015",
            "numbers": [
              "01",
              "09",
              "17",
              "24",
              "35",
              "36"
            ],
            "special": "42",
            "step": "09"
          },
          {
            "hit": "28",
            "issue": "26019",
            "numbers": [
              "04",
              "08",
              "28",
              "33",
              "36",
              "37"
            ],
            "special": "46"
          }
        ]
      },
      {
        "formulas": [
          "第2顆 09+19 = 28",
          "［ 28 ］"
        ],
        "rows": [
          {
            "issue": "26031",
            "numbers": [
              "05",
              "09",
              "11",
              "18",
              "23",
              "47"
            ],
            "special": "24",
            "step": "09"
          },
          {
            "hit": "28",
            "issue": "26035",
            "numbers": [
              "09",
              "18",
              "19",
              "20",
              "28",
              "32"
            ],
            "special": "44"
          }
        ]
      },
      {
        "formulas": [
          "第2顆 09+19 = 28",
          "［ 28 ］"
        ],
        "rows": [
          {
            "issue": "26032",
            "numbers": [
              "06",
              "09",
              "22",
              "26",
              "44",
              "49"
            ],
            "special": "07",
            "step": "09"
          },
          {
            "hit": "28",
            "issue": "26036",
            "numbers": [
              "20",
              "28",
              "32",
              "35",
              "40",
              "43"
            ],
            "special": "45"
          }
        ]
      },
      {
        "formulas": [
          "第2顆 09+19 = 28",
          "第2顆 09+21 = 30"
        ],
        "rows": [
          {
            "issue": "26091",
            "numbers": [
              "07",
              "09",
              "10",
              "15",
              "24",
              "46"
            ],
            "special": "34",
            "step": "09"
          }
        ]
      }
    ],
    "id": "result-09",
    "number": "09",
    "numberOrder": "順球",
    "position": 2,
    "prediction": "28.30",
    "predictionPeriod": 4,
    "summary": "開 09 第 2 顆  |  同期  |  第 2 顆  |  +19.21  |  下 4 期開"
  },
  {
    "algorithmType": "加減",
    "consecutive": "準6進7",
    "finalPrediction": "23、29",
    "groups": [
      {
        "formulas": [
          "第7顆 46+43 = 40",
          "［ 40 ］"
        ],
        "rows": [
          {
            "issue": "26066",
            "numbers": [
              "05",
              "07",
              "10",
              "15",
              "16",
              "41"
            ],
            "special": "46",
            "step": "46"
          },
          {
            "issue": "26069",
            "numbers": [
              "05",
              "07",
              "26",
              "32",
              "37",
              "40"
            ],
            "source": "07",
            "special": "35"
          },
          {
            "hit": "40",
            "issue": "26070",
            "numbers": [
              "12",
              "13",
              "14",
              "17",
              "18",
              "22"
            ],
            "special": "40"
          }
        ]
      },
      {
        "formulas": [
          "第7顆 43+0 = 43",
          "［ 43 ］"
        ],
        "rows": [
          {
            "issue": "26071",
            "numbers": [
              "05",
              "17",
              "26",
              "31",
              "34",
              "46"
            ],
            "special": "43",
            "step": "43"
          },
          {
            "issue": "26074",
            "numbers": [
              "01",
              "07",
              "18",
              "21",
              "33",
              "38"
            ],
            "source": "07",
            "special": "28"
          },
          {
            "hit": "43",
            "issue": "26075",
            "numbers": [
              "02",
              "05",
              "07",
              "11",
              "41",
              "43"
            ],
            "special": "46"
          }
        ]
      },
      {
        "formulas": [
          "第7顆 17+43 = 11",
          "［ 11 ］"
        ],
        "rows": [
          {
            "issue": "26076",
            "numbers": [
              "10",
              "16",
              "19",
              "27",
              "31",
              "44"
            ],
            "special": "17",
            "step": "17"
          },
          {
            "issue": "26079",
            "numbers": [
              "04",
              "07",
              "15",
              "29",
              "32",
              "46"
            ],
            "source": "07",
            "special": "23"
          },
          {
            "hit": "11",
            "issue": "26080",
            "numbers": [
              "05",
              "07",
              "11",
              "12",
              "26",
              "31"
            ],
            "special": "42"
          }
        ]
      },
      {
        "formulas": [
          "第7顆 27+43 = 21",
          "［ 21 ］"
        ],
        "rows": [
          {
            "issue": "26077",
            "numbers": [
              "18",
              "21",
              "26",
              "30",
              "32",
              "44"
            ],
            "special": "27",
            "step": "27"
          },
          {
            "issue": "26080",
            "numbers": [
              "05",
              "07",
              "12",
              "26",
              "31",
              "42"
            ],
            "source": "07",
            "special": "11"
          },
          {
            "hit": "21",
            "issue": "26081",
            "numbers": [
              "04",
              "07",
              "14",
              "20",
              "21",
              "30"
            ],
            "special": "34"
          }
        ]
      },
      {
        "formulas": [
          "第7顆 08+43 = 02",
          "［ 02 ］"
        ],
        "rows": [
          {
            "issue": "26078",
            "numbers": [
              "01",
              "06",
              "37",
              "41",
              "45",
              "47"
            ],
            "special": "08",
            "step": "08"
          },
          {
            "issue": "26081",
            "numbers": [
              "04",
              "07",
              "14",
              "20",
              "21",
              "30"
            ],
            "source": "07",
            "special": "34"
          },
          {
            "hit": "02",
            "issue": "26082",
            "numbers": [
              "01",
              "02",
              "14",
              "17",
              "23",
              "35"
            ],
            "special": "48"
          }
        ]
      },
      {
        "formulas": [
          "第7顆 11+0 = 11",
          "［ 11 ］"
        ],
        "rows": [
          {
            "issue": "26080",
            "numbers": [
              "05",
              "07",
              "12",
              "26",
              "31",
              "42"
            ],
            "special": "11",
            "step": "11"
          },
          {
            "issue": "26083",
            "numbers": [
              "01",
              "07",
              "16",
              "22",
              "32",
              "37"
            ],
            "source": "07",
            "special": "23"
          },
          {
            "hit": "11",
            "issue": "26084",
            "numbers": [
              "04",
              "11",
              "13",
              "16",
              "31",
              "33"
            ],
            "special": "38"
          }
        ]
      },
      {
        "formulas": [
          "第7顆 29+0 = 29",
          "第7顆 29+43 = 23"
        ],
        "rows": [
          {
            "issue": "26092",
            "numbers": [
              "07",
              "09",
              "12",
              "25",
              "34",
              "40"
            ],
            "special": "29",
            "step": "29"
          },
          {
            "issue": "26095",
            "numbers": [
              "04",
              "07",
              "08",
              "11",
              "26",
              "30"
            ],
            "source": "07",
            "special": "42"
          }
        ]
      }
    ],
    "id": "result-07",
    "number": "07",
    "numberOrder": "順球",
    "position": 2,
    "prediction": "23.29",
    "predictionPeriod": 1,
    "summary": "開 07 第 2 顆  |  上 3 期  |  第 7 顆  |  +0.43  |  下 1 期開"
  },
  {
    "algorithmType": "加減",
    "consecutive": "準6進7",
    "finalPrediction": "29、49",
    "groups": [
      {
        "formulas": [
          "第3顆 15+4 = 19",
          "［ 19 ］"
        ],
        "rows": [
          {
            "issue": "24009",
            "numbers": [
              "02",
              "06",
              "07",
              "14",
              "30",
              "43"
            ],
            "source": "14",
            "special": "15"
          },
          {
            "issue": "24013",
            "numbers": [
              "04",
              "12",
              "15",
              "23",
              "24",
              "31"
            ],
            "special": "43",
            "step": "15"
          },
          {
            "hit": "19",
            "issue": "24015",
            "numbers": [
              "15",
              "18",
              "19",
              "22",
              "38",
              "41"
            ],
            "special": "49"
          }
        ]
      },
      {
        "formulas": [
          "第3顆 16+24 = 40",
          "［ 40 ］"
        ],
        "rows": [
          {
            "issue": "24042",
            "numbers": [
              "06",
              "10",
              "12",
              "14",
              "17",
              "41"
            ],
            "source": "14",
            "special": "47"
          },
          {
            "issue": "24046",
            "numbers": [
              "05",
              "06",
              "16",
              "27",
              "37",
              "47"
            ],
            "special": "24",
            "step": "16"
          },
          {
            "hit": "40",
            "issue": "24048",
            "numbers": [
              "09",
              "18",
              "23",
              "28",
              "40",
              "47"
            ],
            "special": "48"
          }
        ]
      },
      {
        "formulas": [
          "第3顆 23+4 = 27",
          "［ 27 ］"
        ],
        "rows": [
          {
            "issue": "24125",
            "numbers": [
              "01",
              "03",
              "06",
              "14",
              "32",
              "34"
            ],
            "source": "14",
            "special": "12"
          },
          {
            "issue": "24129",
            "numbers": [
              "10",
              "14",
              "23",
              "24",
              "33",
              "41"
            ],
            "special": "38",
            "step": "23"
          },
          {
            "hit": "27",
            "issue": "24131",
            "numbers": [
              "05",
              "12",
              "22",
              "27",
              "29",
              "38"
            ],
            "special": "40"
          }
        ]
      },
      {
        "formulas": [
          "第3顆 15+24 = 39",
          "［ 39 ］"
        ],
        "rows": [
          {
            "issue": "24126",
            "numbers": [
              "01",
              "02",
              "07",
              "14",
              "15",
              "25"
            ],
            "source": "14",
            "special": "35"
          },
          {
            "issue": "24130",
            "numbers": [
              "02",
              "13",
              "15",
              "17",
              "22",
              "28"
            ],
            "special": "23",
            "step": "15"
          },
          {
            "hit": "39",
            "issue": "24132",
            "numbers": [
              "01",
              "15",
              "18",
              "22",
              "33",
              "34"
            ],
            "special": "39"
          }
        ]
      },
      {
        "formulas": [
          "第3顆 21+4 = 25",
          "［ 25 ］"
        ],
        "rows": [
          {
            "issue": "25027",
            "numbers": [
              "01",
              "04",
              "09",
              "14",
              "21",
              "37"
            ],
            "source": "14",
            "special": "45"
          },
          {
            "issue": "25031",
            "numbers": [
              "16",
              "20",
              "21",
              "24",
              "39",
              "43"
            ],
            "special": "34",
            "step": "21"
          },
          {
            "hit": "25",
            "issue": "25033",
            "numbers": [
              "08",
              "11",
              "17",
              "25",
              "36",
              "43"
            ],
            "special": "48"
          }
        ]
      },
      {
        "formulas": [
          "第3顆 28+24 = 03",
          "［ 03 ］"
        ],
        "rows": [
          {
            "issue": "26012",
            "numbers": [
              "06",
              "09",
              "12",
              "14",
              "35",
              "44"
            ],
            "source": "14",
            "special": "11"
          },
          {
            "issue": "26016",
            "numbers": [
              "12",
              "22",
              "28",
              "32",
              "37",
              "44"
            ],
            "special": "20",
            "step": "28"
          },
          {
            "hit": "03",
            "issue": "26018",
            "numbers": [
              "02",
              "03",
              "10",
              "14",
              "25",
              "37"
            ],
            "special": "46"
          }
        ]
      },
      {
        "formulas": [
          "第3顆 25+24 = 49",
          "第3顆 25+4 = 29"
        ],
        "rows": [
          {
            "issue": "26090",
            "numbers": [
              "07",
              "08",
              "09",
              "14",
              "39",
              "41"
            ],
            "source": "14",
            "special": "49"
          },
          {
            "issue": "26094",
            "numbers": [
              "12",
              "17",
              "25",
              "31",
              "44",
              "45"
            ],
            "special": "35",
            "step": "25"
          }
        ]
      }
    ],
    "id": "result-14",
    "number": "14",
    "numberOrder": "順球",
    "position": 4,
    "prediction": "29.49",
    "predictionPeriod": 6,
    "summary": "開 14 第 4 顆  |  下 4 期  |  第 3 顆  |  +4.24  |  下 6 期開"
  }
];

