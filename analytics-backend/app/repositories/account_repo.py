"""Part 4 §4.6, Rule R-01 — all SQL for `core.accounts` lives here.

Returns ORM entities or None — never a bare `Result`/`Row`, so the service
layer never has to know the query shape.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core.account import Account


class AccountRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, account_id: int) -> Account | None:
        return await self._session.get(Account, account_id)

    async def get_by_email(self, email: str) -> Account | None:
        stmt = select(Account).where(Account.email == email)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, *, email: str, password_hash: str, full_name: str) -> Account:
        account = Account(email=email, password_hash=password_hash, full_name=full_name)
        self._session.add(account)
        await self._session.flush()  # populate account.id without committing
        return account
