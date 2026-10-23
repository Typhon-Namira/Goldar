from __future__ import annotations
import os, re, secrets, uuid, json
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import create_engine, String, Integer, Float, DateTime, Boolean, ForeignKey, Text, select, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, Session, sessionmaker
from pydantic_settings import BaseSettings, SettingsConfigDict
import jwt
from pwdlib import PasswordHash
import boto3
from botocore.config import Config

class Settings(BaseSettings):
    database_url: str = "sqlite:///./goldar.db"
    jwt_secret: str = ""
    admin_email: str = ""
    admin_password: str = ""
    public_base_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"
    s3_bucket: str = ""
    s3_endpoint_url: str = ""
    s3_region: str = "us-east-1"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_public_url: str = ""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
if not settings.jwt_secret or len(settings.jwt_secret) < 32:
    raise RuntimeError("JWT_SECRET must be configured with at least 32 characters")
if not settings.admin_email or not settings.admin_password:
    raise RuntimeError("ADMIN_EMAIL and ADMIN_PASSWORD must be configured")

is_sqlite = settings.database_url.startswith("sqlite")
engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args={"check_same_thread": False} if is_sqlite else {})
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
class Base(DeclarativeBase): pass

class Store(Base):
    __tablename__ = "stores"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug: Mapped[str] = mapped_column(String(90), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    tagline: Mapped[str] = mapped_column(String(240), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    logo_url: Mapped[str] = mapped_column(String(1000), default="")
    cover_url: Mapped[str] = mapped_column(String(1000), default="")
    theme: Mapped[str] = mapped_column(String(32), default="ivory")
    contact_url: Mapped[str] = mapped_column(String(1000), default="")
    published: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    products: Mapped[list["Product"]] = relationship(back_populates="store", cascade="all, delete-orphan")

class Product(Base):
    __tablename__ = "products"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), index=True)
    slug: Mapped[str] = mapped_column(String(90))
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(20), default="earring")
    metal: Mapped[str] = mapped_column(String(80), default="")
    weight_grams: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    size_label: Mapped[str] = mapped_column(String(80), default="")
    cover_url: Mapped[str] = mapped_column(String(1000), default="")
    glb_url: Mapped[str] = mapped_column(String(1000), default="")
    usdz_url: Mapped[str] = mapped_column(String(1000), default="")
    scale: Mapped[float] = mapped_column(Float, default=1)
    ar_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    published: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    store: Mapped[Store] = relationship(back_populates="products")
    face_calibration: Mapped[Optional["FaceCalibrationRecord"]] = relationship(cascade="all, delete-orphan", uselist=False)

class FaceCalibrationRecord(Base):
    __tablename__ = "face_calibrations"
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    config_json: Mapped[str] = mapped_column(Text, default="{}")

class FaceCalibrationInput(BaseModel):
    height_mm: float = Field(default=35, ge=2, le=600)
    offset_mm: tuple[float,float,float] = (0,0,0)
    rotation_deg: tuple[float,float,float] = (0,0,0)
    anchor: tuple[float,float,float] = (0.5,1,0.5)
    side: str = "both"
    ear_anchor: str = "auto"
    model_config = ConfigDict(allow_inf_nan=False)

class StoreInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    slug: str = Field(min_length=2, max_length=90)
    tagline: str = Field(default="", max_length=240)
    description: str = ""
    logo_url: str = ""
    cover_url: str = ""
    theme: str = "ivory"
    contact_url: str = ""
    published: bool = True

class ProductInput(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    slug: str = Field(min_length=2, max_length=90)
    description: str = ""
    category: str = "earring"
    metal: str = ""
    weight_grams: Optional[float] = Field(default=None, ge=0)
    size_label: str = ""
    cover_url: str = ""
    glb_url: str = ""
    usdz_url: str = ""
    scale: float = Field(default=1, gt=0, le=100)
    ar_enabled: bool = True
    published: bool = True

class LoginInput(BaseModel):
    email: str
    password: str

class UploadInput(BaseModel):
    filename: str = Field(min_length=1, max_length=180)
    content_type: str
    file_size: int = Field(gt=0, le=50_000_000)

def db():
    with SessionLocal() as session:
        yield session

def admin(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentication required")
    try:
        payload = jwt.decode(authorization[7:], settings.jwt_secret, algorithms=["HS256"], options={"require":["exp","sub"]})
        if payload.get("sub") != settings.admin_email:
            raise ValueError("Invalid subject")
    except Exception:
        raise HTTPException(401, "Invalid or expired session")
    return True

def check_slug(slug):
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise HTTPException(422, "Use lowercase letters, numbers and hyphens in slugs")

def store_dict(s):
    return {"id":s.id,"slug":s.slug,"name":s.name,"tagline":s.tagline,"description":s.description,
    "logo_url":s.logo_url,"cover_url":s.cover_url,"theme":s.theme,"contact_url":s.contact_url,
    "published":s.published,"created_at":s.created_at.isoformat()}

def product_dict(p):
    return {"id":p.id,"store_id":p.store_id,"slug":p.slug,"name":p.name,"description":p.description,
    "category":p.category,"metal":p.metal,"weight_grams":p.weight_grams,"size_label":p.size_label,
    "cover_url":p.cover_url,"glb_url":p.glb_url,"usdz_url":p.usdz_url,"scale":p.scale,
    "ar_enabled":p.ar_enabled,"published":p.published,"created_at":p.created_at.isoformat(),
    "face_calibration":json.loads(p.face_calibration.config_json) if p.face_calibration else None,
    "product_url":f"{settings.public_base_url}/s/{p.store.slug}/p/{p.slug}",
    "ar_url":f"{settings.public_base_url}/ar/{p.id}"}

app = FastAPI(title="Goldar API", version="0.1.0")
@app.exception_handler(RequestValidationError)
async def validation_error_handler(request, exc):
    # Do not echo credentials or non-JSON numeric inputs from validation errors.
    return JSONResponse(status_code=422, content={"detail":[{"loc":list(e["loc"]),"msg":e["msg"],"type":e["type"]} for e in exc.errors()]})

app.add_middleware(CORSMiddleware, allow_origins=[v.strip() for v in settings.cors_origins.split(",") if v.strip()],
                   allow_methods=["GET","POST","PUT","PATCH","DELETE"], allow_headers=["Authorization","Content-Type"])
@app.on_event("startup")
def initialize():
    Base.metadata.create_all(engine)

@app.get("/health")
def health(): return {"status":"ok"}

@app.post("/api/auth/login")
def login(body: LoginInput):
    # Constant-time comparison; hash actual admin secret on every attempt.
    if not secrets.compare_digest(body.email.lower(), settings.admin_email.lower()) or not secrets.compare_digest(body.password, settings.admin_password):
        raise HTTPException(401,"Invalid credentials")
    token = jwt.encode({"sub":settings.admin_email,"exp":datetime.now(timezone.utc)+timedelta(hours=8)}, settings.jwt_secret, algorithm="HS256")
    return {"access_token":token,"token_type":"bearer"}

@app.get("/api/admin/stores")
def admin_stores(_:bool=Depends(admin),session:Session=Depends(db)):
    return [store_dict(s) for s in session.scalars(select(Store).order_by(Store.created_at.desc())).all()]

@app.post("/api/admin/stores", status_code=201)
def create_store(body:StoreInput,_:bool=Depends(admin),session:Session=Depends(db)):
    check_slug(body.slug)
    if session.scalar(select(Store).where(Store.slug==body.slug)): raise HTTPException(409,"Store slug already exists")
    s=Store(**body.model_dump());session.add(s);session.commit();return store_dict(s)

@app.patch("/api/admin/stores/{store_id}")
def update_store(store_id:str,body:StoreInput,_:bool=Depends(admin),session:Session=Depends(db)):
    s=session.get(Store,store_id)
    if not s: raise HTTPException(404,"Store not found")
    check_slug(body.slug)
    existing=session.scalar(select(Store).where(Store.slug==body.slug))
    if existing and existing.id!=store_id: raise HTTPException(409,"Store slug already exists")
    for key,val in body.model_dump().items(): setattr(s,key,val)
    session.commit();return store_dict(s)

@app.delete("/api/admin/stores/{store_id}",status_code=204)
def delete_store(store_id:str,_:bool=Depends(admin),session:Session=Depends(db)):
    s=session.get(Store,store_id)
    if not s: raise HTTPException(404,"Store not found")
    session.delete(s);session.commit()

@app.get("/api/admin/stores/{store_id}/products")
def admin_products(store_id:str,_:bool=Depends(admin),session:Session=Depends(db)):
    if not session.get(Store,store_id): raise HTTPException(404,"Store not found")
    return [product_dict(p) for p in session.scalars(select(Product).where(Product.store_id==store_id).order_by(Product.created_at.desc())).all()]

@app.post("/api/admin/stores/{store_id}/products",status_code=201)
def create_product(store_id:str,body:ProductInput,_:bool=Depends(admin),session:Session=Depends(db)):
    check_slug(body.slug)
    if body.category not in ("necklace","earring"): raise HTTPException(422,"Invalid category")
    if not session.get(Store,store_id): raise HTTPException(404,"Store not found")
    if session.scalar(select(Product).where(Product.store_id==store_id,Product.slug==body.slug)):
        raise HTTPException(409,"Product slug already exists in this store")
    p=Product(store_id=store_id,**body.model_dump());session.add(p);session.commit();return product_dict(p)

@app.patch("/api/admin/products/{product_id}")
def update_product(product_id:str,body:ProductInput,_:bool=Depends(admin),session:Session=Depends(db)):
    p=session.get(Product,product_id)
    if not p: raise HTTPException(404,"Product not found")
    check_slug(body.slug)
    if body.category not in ("necklace","earring"): raise HTTPException(422,"Invalid category")
    exists=session.scalar(select(Product).where(Product.store_id==p.store_id,Product.slug==body.slug))
    if exists and exists.id!=p.id: raise HTTPException(409,"Product slug already exists")
    for key,val in body.model_dump().items(): setattr(p,key,val)
    session.commit();return product_dict(p)

@app.put("/api/admin/products/{product_id}/face-calibration")
def save_face_calibration(product_id:str,body:FaceCalibrationInput,_:bool=Depends(admin),session:Session=Depends(db)):
    p=session.get(Product,product_id)
    if not p: raise HTTPException(404,"Product not found")
    if p.category not in ("earring","necklace"): raise HTTPException(422,"Face fitting supports earrings and necklaces")
    if body.side not in ("both","left","right") or body.ear_anchor not in ("auto","lobe") or any(v<0 or v>1 for v in body.anchor):
        raise HTTPException(422,"Invalid attachment calibration")
    if any(abs(v)>1000 for v in body.offset_mm) or any(abs(v)>360 for v in body.rotation_deg):
        raise HTTPException(422,"Calibration exceeds supported range")
    record=session.get(FaceCalibrationRecord,product_id)
    if not record:
        record=FaceCalibrationRecord(product_id=product_id)
        session.add(record)
    record.config_json=json.dumps(body.model_dump())
    session.commit();session.refresh(p)
    return product_dict(p)

@app.delete("/api/admin/products/{product_id}",status_code=204)
def delete_product(product_id:str,_:bool=Depends(admin),session:Session=Depends(db)):
    p=session.get(Product,product_id)
    if not p: raise HTTPException(404,"Product not found")
    session.delete(p);session.commit()

@app.get("/api/public/stores/{slug}")
def public_store(slug:str,session:Session=Depends(db)):
    s=session.scalar(select(Store).where(Store.slug==slug,Store.published==True))
    if not s: raise HTTPException(404,"Store not found")
    return {"store":store_dict(s),"products":[product_dict(p) for p in s.products if p.published]}

@app.get("/api/public/stores/{slug}/products/{product_slug}")
def public_product(slug:str,product_slug:str,session:Session=Depends(db)):
    p=session.scalar(select(Product).join(Store).where(Store.slug==slug,Store.published==True,Product.slug==product_slug,Product.published==True))
    if not p: raise HTTPException(404,"Product not found")
    return {"store":store_dict(p.store),"product":product_dict(p)}

@app.get("/api/public/products/{product_id}")
def public_product_by_id(product_id:str,session:Session=Depends(db)):
    p=session.get(Product,product_id)
    if not p or not p.published or not p.store.published: raise HTTPException(404,"Product not found")
    return {"store":store_dict(p.store),"product":product_dict(p)}

@app.post("/api/admin/uploads/presign")
def presign_upload(body:UploadInput,_:bool=Depends(admin)):
    if not settings.s3_bucket or not settings.s3_public_url:
        raise HTTPException(503,"Object storage not configured")
    allowed={"model/gltf-binary":".glb","model/vnd.usdz+zip":".usdz","application/octet-stream":None,
             "image/jpeg":".jpg","image/png":".png","image/webp":".webp"}
    ext=os.path.splitext(body.filename.lower())[1]
    if ext not in (".glb",".usdz",".jpg",".jpeg",".png",".webp") or body.content_type not in allowed:
        raise HTTPException(422,"Unsupported file type")
    if body.content_type=="application/octet-stream" and ext not in (".glb",".usdz"):
        raise HTTPException(422,"Unsupported binary upload")
    if ext==".glb" and body.content_type not in ("model/gltf-binary","application/octet-stream"):raise HTTPException(422,"GLB MIME mismatch")
    if ext==".usdz" and body.content_type not in ("model/vnd.usdz+zip","application/octet-stream"):raise HTTPException(422,"USDZ MIME mismatch")
    key=f"assets/{uuid.uuid4()}{ext}"
    client=boto3.client("s3",endpoint_url=settings.s3_endpoint_url or None,
        region_name=settings.s3_region,aws_access_key_id=settings.s3_access_key_id or None,
        aws_secret_access_key=settings.s3_secret_access_key or None,
        config=Config(signature_version="s3v4"))
    try:
        signed=client.generate_presigned_post(Bucket=settings.s3_bucket,Key=key,
          Fields={"Content-Type":body.content_type},
          Conditions=[{"Content-Type":body.content_type},["content-length-range",1,min(body.file_size+1024,50_001_024)]],
          ExpiresIn=300)
    except Exception: raise HTTPException(503,"Unable to sign upload")
    return {"upload":signed,"asset_url":f"{settings.s3_public_url.rstrip('/')}/{key}"}

# Read-only catalog intelligence endpoints. No schema migration required.
@app.get("/api/admin/overview")
def admin_overview(_:bool=Depends(admin),session:Session=Depends(db)):
    store_count=session.scalar(select(func.count(Store.id))) or 0
    live_stores=session.scalar(select(func.count(Store.id)).where(Store.published==True)) or 0
    pieces=session.scalar(select(func.count(Product.id))) or 0
    live_pieces=session.scalar(select(func.count(Product.id)).join(Store).where(Product.published==True,Store.published==True)) or 0
    return {"stores":store_count,"published_stores":live_stores,"products":pieces,"published_products":live_pieces}

@app.get("/api/admin/products")
def admin_all_products(
    store_id:Optional[str]=None,
    category:Optional[str]=None,
    limit:int=Query(default=50,ge=1,le=200),
    offset:int=Query(default=0,ge=0),
    _:bool=Depends(admin),
    session:Session=Depends(db)):
    query=select(Product).order_by(Product.created_at.desc())
    if store_id:
        query=query.where(Product.store_id==store_id)
    if category:
        if category not in ("necklace","earring"):
            raise HTTPException(422,"Unsupported jewelry category")
        query=query.where(Product.category==category)
    return [product_dict(p) for p in session.scalars(query.limit(limit).offset(offset)).all()]
