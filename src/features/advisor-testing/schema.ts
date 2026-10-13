import { z } from "zod";

export const scenarioTypeSchema = z.enum(["A", "B", "C", "D", "E", "F"]);
export const testUserRoleSchema = z.enum(["user", "admin"]);
export const historyOutcomeSchema = z.enum(["easy", "hard", "incomplete"]);
