import { describe, it, expect } from "vitest";
import {
  ClassType,
  UpdateType,
  BeltColor,
  TeamMemberType,
  CLASS_TYPE_CONFIG,
  UPDATE_TAG_CONFIG,
  BELT_COLOR_MAP,
  TEAM_TYPE_CONFIG,
  FAQ_ITEMS,
  DAYS_OF_WEEK,
} from "../constants";

describe("ClassType enum", () => {
  it("has all expected values", () => {
    expect(ClassType.Gi).toBe("gi");
    expect(ClassType.NoGi).toBe("nogi");
    expect(ClassType.Youth).toBe("youth");
    expect(ClassType.OpenMat).toBe("openmat");
    expect(ClassType.Special).toBe("special");
  });
});

describe("UpdateType enum", () => {
  it("has all expected values", () => {
    expect(UpdateType.Alert).toBe("alert");
    expect(UpdateType.Event).toBe("event");
    expect(UpdateType.Class).toBe("class");
    expect(UpdateType.News).toBe("news");
  });
});

describe("BeltColor enum", () => {
  it("has BJJ progression", () => {
    expect(BeltColor.White).toBe("white");
    expect(BeltColor.Blue).toBe("blue");
    expect(BeltColor.Purple).toBe("purple");
    expect(BeltColor.Brown).toBe("brown");
    expect(BeltColor.Black).toBe("black");
  });
});

describe("CLASS_TYPE_CONFIG", () => {
  it("has a config entry for every ClassType", () => {
    Object.values(ClassType).forEach((type) => {
      expect(CLASS_TYPE_CONFIG[type]).toBeDefined();
      expect(CLASS_TYPE_CONFIG[type].label).toBeTruthy();
    });
  });
});

describe("UPDATE_TAG_CONFIG", () => {
  it("has a config entry for every UpdateType", () => {
    Object.values(UpdateType).forEach((type) => {
      expect(UPDATE_TAG_CONFIG[type]).toBeDefined();
      expect(UPDATE_TAG_CONFIG[type].label).toBeTruthy();
    });
  });
});

describe("BELT_COLOR_MAP", () => {
  it("maps every belt to a theme-responsive CSS var reference", () => {
    // Was literal hex; deliberately moved to CSS custom properties so belts
    // follow the active theme. A hard-coded hex creeping back in is the
    // regression this now guards against.
    Object.values(BeltColor).forEach((belt) => {
      expect(BELT_COLOR_MAP[belt], `BELT_COLOR_MAP missing "${belt}"`)
        .toMatch(/^var\(--color-belt-[a-z-]+\)$/);
    });
  });
});

describe("TEAM_TYPE_CONFIG", () => {
  it("has a config entry for every TeamMemberType", () => {
    Object.values(TeamMemberType).forEach((type) => {
      expect(TEAM_TYPE_CONFIG[type]).toBeDefined();
    });
  });
});

describe("FAQ_ITEMS", () => {
  it("has 7 items", () => {
    expect(FAQ_ITEMS).toHaveLength(7);
  });

  it("each item has question and answer", () => {
    FAQ_ITEMS.forEach((item) => {
      expect(item.question).toBeTruthy();
      expect(item.answer).toBeTruthy();
    });
  });
});

describe("DAYS_OF_WEEK", () => {
  it("has 7 days starting with Monday", () => {
    expect(DAYS_OF_WEEK).toHaveLength(7);
    expect(DAYS_OF_WEEK[0]).toBe("Monday");
    expect(DAYS_OF_WEEK[6]).toBe("Sunday");
  });
});
