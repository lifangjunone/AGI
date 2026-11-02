"""Clean v2 application entrypoint. Legacy product modules are not loaded."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import store as st
from studio import router as studio_router


class AccountInput(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    email: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=6, max_length=120)


class LoginInput(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=6, max_length=120)


@asynccontextmanager
async def lifespan(_app):
    st.initialize()
    yield


app = FastAPI(title="Agent Workforce Lab v2", version="2.0.0", lifespan=lifespan)
app.include_router(studio_router)


def account_response(db, account, token=None, status_code=200):
    response = JSONResponse({"account": st.account_view(account)}, status_code=status_code)
    if token:
        response.set_cookie(
            "awl_session", token, httponly=True, samesite="lax",
            max_age=60 * 60 * 24 * 30,
        )
    return response


@app.post("/api/auth/register", status_code=201)
def register(body: AccountInput):
    email = body.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(422, "请输入有效邮箱")
    with st.transaction() as db:
        if st.get_account_by_email(db, email):
            raise HTTPException(409, "这个邮箱已经注册，请直接登录")
        st.create_account(db, body.name.strip(), email, body.password)
        account = st.get_account_by_email(db, email)
        return account_response(db, account, st.create_session(db, account["id"]), 201)


@app.post("/api/auth/login")
def login(body: LoginInput):
    with st.transaction() as db:
        account = st.get_account_by_email(db, body.email.strip().lower())
        if not account or not st.verify_password(body.password, account["password_hash"]):
            raise HTTPException(401, "邮箱或密码不正确")
        return account_response(db, account, st.create_session(db, account["id"]))


@app.get("/api/auth/me")
def me(request: Request):
    with st.transaction() as db:
        account = st.account_by_session(db, request.cookies.get("awl_session"))
        return {"account": st.account_view(account) if account else None}


@app.post("/api/auth/logout")
def logout(request: Request, response: Response):
    with st.transaction() as db:
        token = request.cookies.get("awl_session")
        if token:
            db.execute("DELETE FROM sessions WHERE token=?", (token,))
    response.delete_cookie("awl_session")
    return {"account": None}


@app.get("/api/health")
def health():
    return {"status": "ok", "product": "agent-workforce-v2"}


DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"
if (DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    candidate = (DIST / path).resolve()
    if path and candidate.is_relative_to(DIST) and candidate.is_file():
        return FileResponse(candidate)
    index = DIST / "index.html"
    if index.exists():
        return FileResponse(index)
    raise HTTPException(404, "请先构建前端")
