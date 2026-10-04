"""Rebuild PRISM promotional films and stills. Python: Pillow, numpy; ffmpeg.
Usage: python render_media.py --ffmpeg /path/to/ffmpeg
Fonts default to macOS Hiragino; override PRISM_JP_FONT / PRISM_SERIF_FONT.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
import os, math, argparse, subprocess, wave
import numpy as np
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/promotion'
TMP = ROOT / 'output/promotion'
TMP.mkdir(parents=True, exist_ok=True)
fonts = Path('/System/Library/Fonts')
JP = os.environ.get('PRISM_JP_FONT') or str(next(fonts.glob('*角*W3.ttc')))
SERIF = os.environ.get('PRISM_SERIF_FONT') or str(next(fonts.glob('*明朝*.ttc')))
LATIN = str(fonts / 'Avenir Next.ttc')
FONT_CACHE = {}
def font(size, serif=False, latin=False):
    key = (size,serif,latin)
    if key not in FONT_CACHE: FONT_CACHE[key] = ImageFont.truetype(LATIN if latin else SERIF if serif else JP, size)
    return FONT_CACHE[key]
PAPER=(247,248,250); INK=(39,51,69); DARK=(23,25,29); BLUE=(40,100,220); HIGHLIGHT=(173,201,255); MUTED=(89,97,109)
hero = Image.open(OUT/'assets/prism-hero-blue.png').convert('RGB')
# A delivery derivative, preserving the original artwork.
hero.save(OUT/'assets/prism-hero.jpg', quality=94)

def txt(draw, xy, text, size=40, fill=INK, serif=False, latin=False, spacing=None):
    x,y=xy
    for line in text.split('\n'):
        draw.text((x,y),line,font=font(size,serif,latin),fill=fill,stroke_width=0)
        y += spacing or int(size*1.55)

def logo(draw,x,y,color=INK,size=40):
    s=size
    draw.line([(x+s*.43,y+3),(x+s*.82,y+s*.85),(x,y+s*.85),(x+s*.43,y+3),(x+s*.43,y+s*.85)],fill=color,width=2)
    draw.line([(x,y+s*.85),(x+s*.65,y+s*.44)],fill=color,width=1)
    txt(draw,(x+s+14,y-5),'PRISM',size,color,latin=True)

def bg(w,h,dark=False,t=0):
    if not dark: return Image.new('RGB',(w,h),PAPER)
    # Gentle camera travel; no generated in-between imagery.
    base=ImageOps.fit(hero,(int(w*1.045),int(h*1.045)),centering=(.65,.5))
    dx=int((base.width-w)*(.4+.3*math.sin(t*.035)))
    im=base.crop((dx,0,dx+w,h))
    overlay=Image.new('RGB',(w,h),DARK)
    return Image.blend(im,overlay,.62 if h>=w else .38)

def chart(draw,x,y,w,h,low=-8,high=18,progress=1,compact=False):
    unit=22 if compact else 24
    txt(draw,(x,y),'環境関連コストを考慮したNPV',unit,INK)
    txt(draw,(x,y+40),'単位：百万円 / 承認基準：0',unit-4,MUTED)
    top=y+115; bottom=y+h-50
    for i in range(5):
        xx=x+w*i/4
        draw.line((xx,top,xx,bottom),fill=(219,226,236),width=1)
        value=-30+15*i
        txt(draw,(xx-15,bottom+18),str(value) if value<=0 else '+'+str(value),20,MUTED,latin=True)
    zero=x+w/2
    for yy in range(int(top-20),int(bottom),12): draw.line((zero,yy,zero,yy+6),fill=(105,117,134),width=2)
    l=x+(low+30)/60*w; r=x+(high+30)/60*w
    cy=top+(bottom-top)*.45
    draw.rounded_rectangle((l,cy,l+(r-l)*max(.01,progress),cy+42),radius=3,fill=BLUE)
    txt(draw,(l-16,cy+58),'−'+str(-low) if low<0 else '+'+str(low),32,INK,latin=True)
    txt(draw,(r-28,cy+58),'+'+str(high) if high>0 else '−'+str(-high),32,INK,latin=True)
    txt(draw,(x,bottom+68),'説明用の架空値・概念図。実際の算定結果ではありません。',17,MUTED)

SCENES=[(0,6),(6,12),(12,19),(19,27),(27,34),(34,40),(40,45)]

def landscape(t):
    idx=next((i for i,(a,b) in enumerate(SCENES) if a<=t<b),6)
    a,b=SCENES[idx]; p=min(1,max(0,(t-a)/.9)); ease=1-(1-p)**3
    im=bg(1920,1080,idx in (0,5,6),t); d=ImageDraw.Draw(im)
    dark=idx in (0,5,6); col=PAPER if dark else INK
    logo(d,100,64,col,43)
    txt(d,(1420,77),'ENVIRONMENTAL DECISIONS',18,(206,210,216) if dark else MUTED,latin=True)
    shift=int((1-ease)*24)
    if idx==0:
        txt(d,(110,275+shift),'算出方法で、\n変わる金額。',85,PAPER,serif=True,spacing=142)
        txt(d,(115,780),'環境財務評価プラットフォーム PRISM',29,HIGHLIGHT)
    elif idx==1:
        txt(d,(110,270+shift),'評価額を比較し、\n金額が違う理由を確認。',76,INK,serif=True,spacing=160)
        d.line((117,748,740,748),fill=(219,226,236),width=2)
        txt(d,(117,794),'評価の対象範囲と前提を確認し、財務影響の算定へ。',32,MUTED)
        txt(d,(1560,700),'?',210,(219,226,236),serif=True)
    elif idx==2:
        txt(d,(110,212+shift),'試算結果が、赤字にも黒字にも。',68,INK,serif=True)
        txt(d,(110,347),'例：節水設備のNPVが、−800万円〜＋1,800万円。',36,MUTED)
        chart(d,190,500,1490,330,progress=ease)
    elif idx==3:
        txt(d,(110,240+shift),'算定方法や\n評価の前提を',76,INK,serif=True,spacing=122)
        txt(d,(115,568),'確かめてから、\n投資を判断。',48,BLUE,serif=True,spacing=82)
        chart(d,950,275,760,390,progress=1)
        txt(d,(955,840),'投資効果が、承認基準の0をまたぐ場合。',26,INK)
    elif idx==4:
        txt(d,(110,215+shift),'試算を、稟議・開示の説明に使う。',68,INK,serif=True)
        labels=[('01','金額に換算','複数の方法で、環境データを金額に換算。'),('02','基準と照合','財務影響と重要性を、判断基準と照合。'),('03','根拠を記録','計算方法と前提を記録し、説明に使う。')]
        for i,(n,title,body) in enumerate(labels):
            x=115+i*585
            d.line((x,456,x+510,456),fill=(219,226,236),width=2)
            txt(d,(x,488),n,30,BLUE,latin=True)
            txt(d,(x,577),title,44,INK,serif=True)
            # wrap supporting sentence for readable scale
            lines=[body[:13],body[13:]] if len(body)>20 else [body]
            txt(d,(x,693),'\n'.join(lines),25,MUTED,spacing=47)
        txt(d,(115,920),'適用範囲・比較可能性・利用条件は、対象ごとに確認します。',20,MUTED)
    elif idx==5:
        txt(d,(110,280+shift),'環境の財務影響を、\n算定・評価・判定。',84,PAPER,serif=True,spacing=148)
        txt(d,(116,785),'環境情報と事業・財務データを、経営判断の根拠に。',29,HIGHLIGHT)
    else:
        txt(d,(110,245+shift),'正解のない環境の評価額を、\n投資の根拠に変える。',65,PAPER,serif=True,spacing=136)
        txt(d,(115,180),'算出方法で、変わる金額。',29,HIGHLIGHT)
        txt(d,(115,647),'環境財務評価プラットフォーム',34,HIGHLIGHT)
        d.line((115,756,800,756),fill=(130,138,150),width=2)
        txt(d,(115,804),'デザインパートナー向け紹介',26,PAPER)
        txt(d,(115,859),'LPで、評価・判定の具体例を見る  ↗',25,HIGHLIGHT)
    d.line((100,1007,1820,1007),fill=(130,138,150) if dark else (219,226,236),width=1)
    d.line((100,1007,100+1720*t/45,1007),fill=HIGHLIGHT if dark else BLUE,width=3)
    txt(d,(100,1027),'PRISM / BRAND FILM',13,col,latin=True)
    txt(d,(1640,1027),f'{idx+1:02d} / 07',15,col,latin=True)
    # Gentle transition, without a flash or complete blackout.
    fade=min(1,(t-a)/.35) if t>a else 0
    if idx>0 and fade<1:
        prev=landscape(a-.001)
        im=Image.blend(prev,im,fade)
    return im

def vertical(t):
    idx=min(2,int(t/5)); p=min(1,(t-idx*5)/.8); shift=int((1-(1-(1-p)**3))*20)
    im=bg(1080,1920,idx!=1,t); d=ImageDraw.Draw(im); col=PAPER if idx!=1 else INK
    logo(d,85,210,col,53)
    txt(d,(88,323),'環境財務評価プラットフォーム',24,col)
    if idx==0:
        txt(d,(80,535+shift),'算出方法で、\n変わる金額。',87,PAPER,serif=True,spacing=160)
        txt(d,(86,1210),'複数の方法で算出した\n評価額と、その違いを比較。',37,HIGHLIGHT,spacing=73)
    elif idx==1:
        txt(d,(80,455+shift),'試算は赤字か、\n黒字か。\n基準と比較。',80,INK,serif=True,spacing=140)
        chart(d,105,985,850,345,progress=min(1,(t-5)/1.1),compact=True)
        txt(d,(100,1530),'算定方法や評価の前提を確認。',31,INK)
    else:
        txt(d,(86,412),'算出方法で、変わる金額。',32,HIGHLIGHT)
        txt(d,(80,490+shift),'正解のない\n環境の評価額を、\n投資の根拠に変える。',66,PAPER,serif=True,spacing=137)
        txt(d,(86,1140),'環境財務評価\nプラットフォーム',41,HIGHLIGHT,serif=True,spacing=78)
        d.line((86,1370,994,1370),fill=(130,138,150),width=2)
        txt(d,(86,1430),'LPで、評価・判定の具体例を見る ↗',32,PAPER)
        txt(d,(86,1510),'デザインパートナー向け紹介',24,HIGHLIGHT)
    txt(d,(86,1640),'PRISM / ENVIRONMENTAL DECISION INTELLIGENCE',16,col,latin=True)
    return im

def soundtrack(path,duration):
    sr=48000; count=int(sr*duration); data=np.zeros((count,2),dtype=np.float64)
    # Original synthesized score: slow, restrained Dmaj9 / Bm7 / Gmaj9 / Asus harmony.
    roots=[146.832,123.471,97.999,110.0]
    for bar in range(math.ceil(duration/5)):
        root=roots[bar%4]
        for j,ratio in enumerate([1,1.5,2,2.25]):
            start=bar*5+j*.7; length=min(5.8,duration-start)
            if length<=0: continue
            tt=np.arange(int(sr*length))/sr; f=root*ratio
            env=(1-np.exp(-tt*20))*np.exp(-tt/1.6)*np.minimum(1,(length-tt)/.15)
            tone=(np.sin(2*np.pi*f*tt)+.22*np.sin(2*np.pi*f*2.001*tt)+.07*np.sin(2*np.pi*f*3*tt))*env*.065
            pos=int(start*sr); n=min(len(tone),count-pos)
            pan=(-.3 if j%2 else .3)
            data[pos:pos+n,0]+=tone[:n]*(1-pan)
            data[pos:pos+n,1]+=tone[:n]*(1+pan)
        # Soft sustained foundation
        start=bar*5; length=min(5.4,duration-start); tt=np.arange(int(sr*length))/sr
        env=np.minimum(1,tt/1.2)*np.minimum(1,(length-tt)/1.2)
        pad=.018*env*(np.sin(2*np.pi*root*.5*tt)+.5*np.sin(2*np.pi*root*.75*tt))
        pos=int(start*sr); n=min(len(pad),count-pos)
        data[pos:pos+n,:]+=pad[:n,None]
    tt=np.arange(count)/sr; fade=np.minimum(1,tt/1.5)*np.minimum(1,(duration-tt)/2)
    data*=fade[:,None]; data=np.clip(data,-.8,.8)
    with wave.open(str(path),'wb') as wf:
        wf.setnchannels(2); wf.setsampwidth(2); wf.setframerate(sr); wf.writeframes((data*32767).astype('<i2').tobytes())

def movie(ffmpeg,mode,duration,w,h,name):
    audio=TMP/f'{name}.wav'; soundtrack(audio,duration)
    cmd=[ffmpeg,'-y','-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{w}x{h}','-r','24','-i','-','-i',str(audio),'-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','48000','-movflags','+faststart','-t',str(duration),str(OUT/'video'/f'{name}.mp4')]
    proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    for frame in range(duration*24):
        im=mode(frame/24)
        proc.stdin.write(im.tobytes())
        if frame%240==0: print(name,frame//24,'seconds rendered',flush=True)
    proc.stdin.close()
    if proc.wait()!=0: raise RuntimeError('ffmpeg encoding failed')

def stills():
    landscape(42).save(OUT/'assets/film-poster.jpg',quality=95)
    # Social cards carry their own message, rather than a cropped website screenshot.
    for w,h,name in [(1200,630,'social-landscape.png'),(1080,1080,'social-square.png')]:
        im=bg(w,h,True); d=ImageDraw.Draw(im); logo(d,60,45,PAPER,35)
        txt(d,(64,135 if h==630 else 235),'算出方法で、変わる金額。',26 if h==630 else 34,HIGHLIGHT)
        txt(d,(62,205 if h==630 else 350),'正解のない環境の評価額を、\n投資の根拠に変える。',44 if h==630 else 57,PAPER,serif=True,spacing=90 if h==630 else 120)
        txt(d,(65,470 if h==630 else 720),'環境財務評価プラットフォーム',24 if h==630 else 30,HIGHLIGHT)
        txt(d,(65,h-70),'PRISM / デザインパートナー向け紹介',18,PAPER)
        im.save(OUT/'assets'/name)
    vertical(12).save(OUT/'assets/social-vertical.png')
    thumbs=[]
    for t in [3,9,15,23,30,37,43]:
        thumb=landscape(t).resize((640,360)); thumbs.append(thumb)
    sheet=Image.new('RGB',(1280,4*400),PAPER)
    for i,im in enumerate(thumbs):
        x=(i%2)*640;y=(i//2)*400;sheet.paste(im,(x,y));ImageDraw.Draw(sheet).text((x+12,y+368),f'Scene {i+1}',font=font(18,latin=True),fill=INK)
    sheet.save(TMP/'film-contact-sheet.jpg',quality=92)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--ffmpeg',required=True);parser.add_argument('--stills-only',action='store_true');parser.add_argument('--vertical-only',action='store_true');args=parser.parse_args()
    stills()
    if not args.stills_only:
        if not args.vertical_only: movie(args.ffmpeg,landscape,45,1920,1080,'prism-brand-45s')
        movie(args.ffmpeg,vertical,15,1080,1920,'prism-social-15s')
