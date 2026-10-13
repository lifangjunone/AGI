from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Question(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["noul", "choice", "score"]
    instructions: str = Field(min_length=1)
    criteria: dict[str, str] | list[str] | None = None

    @field_validator("criteria")
    @classmethod
    def validate_criteria(cls, value: Any, info):
        kind = info.data.get("type")
        if kind == "choice" and (not isinstance(value, dict) or len(value) < 2):
            raise ValueError("choice 至少需要两个候选项")
        if kind == "score" and (not isinstance(value, list) or len(value) < 2):
            raise ValueError("score 至少需要两个有序等级")
        return value


class DecideRequest(BaseModel):
    state: str | dict[str, Any] | list[Any]
    questions: dict[str, Question]
    model: str = "clm-latest"
    temperature: float = Field(default=1.0, gt=0, le=100)


class RankRequest(BaseModel):
    context: str | dict[str, Any] | list[Any]
    question: str = ""
    answers: list[str] = Field(min_length=2)
    model: str = "clm-latest"
    temperature: float = Field(default=1.0, gt=0, le=100)


class EvalExample(BaseModel):
    id: str
    state: str | dict[str, Any] | list[Any]
    question: Question
    label: str


class EvaluationRequest(BaseModel):
    examples: list[EvalExample] = Field(min_length=1)
    model: str = "clm-latest"
    temperature: float = Field(default=1.0, gt=0, le=100)
    bins: int = Field(default=10, ge=2, le=50)
