from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Question(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["choice", "noul", "score"]
    instructions: str = Field(min_length=1, max_length=4000)
    criteria: dict[str, str] | list[str] | None = None

    @field_validator("criteria")
    @classmethod
    def validate_criteria(cls, value, info):
        kind = info.data.get("type")
        if kind == "choice" and (not isinstance(value, dict) or not 2 <= len(value) <= 255):
            raise ValueError("choice 需要 2–255 个选项")
        if kind == "score" and (not isinstance(value, list) or not 2 <= len(value) <= 10):
            raise ValueError("score 需要 2–10 个等级")
        return value


class DecisionRequest(BaseModel):
    provider: Literal["clm", "jev"] = "clm"
    state: str | dict[str, Any] | list[Any]
    questions: dict[str, Question] = Field(min_length=1, max_length=20)
    model: str | None = None
    temperature: float = Field(default=1, gt=0, le=100)
    jev_api_key: str | None = Field(default=None, min_length=8)


class CompareRequest(BaseModel):
    state: str | dict[str, Any] | list[Any]
    questions: dict[str, Question] = Field(min_length=1, max_length=20)
    temperature: float = Field(default=1, gt=0, le=100)
    jev_api_key: str = Field(min_length=8)


class RankRequest(BaseModel):
    provider: Literal["clm", "jev"] = "clm"
    context: str | dict[str, Any] | list[Any]
    question: str = ""
    answers: list[str] = Field(min_length=2, max_length=255)
    model: str | None = None
    temperature: float = Field(default=1, gt=0, le=100)
    jev_api_key: str | None = Field(default=None, min_length=8)
