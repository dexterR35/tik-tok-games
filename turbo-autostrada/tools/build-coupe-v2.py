"""Sculpted fastback panels for the interactive LIVE car. Blender 5.x, no add-ons."""
import bpy, math, os
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(ROOT,'public','garage','assets')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0,rough=.4):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
    if 'Coat Weight' in n.inputs:n.inputs['Coat Weight'].default_value=.8
    return m
paint=mat('body_paint',(.44,.65,.14),.52,.24);glass=mat('car_glass',(.025,.065,.085),.5,.14);black=mat('carbon_trim',(.012,.018,.021),.3,.48);silver=mat('polished_alloy',(.5,.55,.57),.88,.23);rubber=mat('tire_rubber',(.008,.012,.013),0,.85)
def xyz(p):return(p[0],-p[2],p[1])
def mesh(name,vertices,faces,material):
    data=bpy.data.meshes.new(name);data.from_pydata([xyz(p) for p in vertices],[],faces);data.update();o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.data.materials.append(material)
    for p in data.polygons:p.use_smooth=True
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False);return o
def surface(name,fn,material,nu=30,nv=16):
    v=[fn(i/nu,j/nv) for j in range(nv+1) for i in range(nu+1)];f=[]
    for j in range(nv):
        for i in range(nu):a=j*(nu+1)+i;f.append((a,a+1,a+nu+2,a+nu+1))
    return mesh(name,v,f,material)
outline=[(-2.61,.42),(-2.13,.42)]
for center in[-1.57,1.57]:
    if center>0:outline.append((center-.56,.44))
    for i in range(33):a=math.pi-i/32*math.pi;outline.append((center+math.cos(a)*.56,.44+math.sin(a)*.56))
outline += [(2.57,.42),(2.63,.57),(2.62,.85),(2.57,.96),(2.43,1.03),(2.1,1.09),(1.4,1.12),(.6,1.13),(-.6,1.13),(-.93,1.11985),(-1.25,1.11),(-1.9,1.07),(-2.35,1.02),(-2.56,.94),(-2.64,.78)]
rings=[-1,-.99,-.96,-.91,-.80,-.60,-.3,0,.3,.60,.80,.91,.96,.99,1];verts=[]
for z in rings:
    for x,y in outline:
        edge=abs(z);upper=max(0,min(1,(y-.82)/.28));flare=.055*math.exp(-((abs(x)-1.57)/.55)**2)*max(0,min(1,(y-.55)/.35))
        verts.append((x*(1-.026*edge**8),y+upper*(.07*(1-edge**3)-.035*edge**10),z*(1+flare)))
n=len(outline);faces=[]
for k in range(len(rings)-1):
    for j in range(n):
        a,b=outline[j],outline[(j+1)%n]
        # Leave an actual engine-bay opening below the separately hinged bonnet.
        if min(a[1],b[1])>=1.02 and min(a[0],b[0])>=-2.35 and max(a[0],b[0])<=-.93 and max(abs(rings[k]),abs(rings[k+1]))<=.80:continue
        faces.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
faces += [tuple(reversed(range(n))),tuple((len(rings)-1)*n+j for j in range(n))]
body=mesh('body_shell',verts,faces,paint);bev=body.modifiers.new('Subtle rolled panel edges','BEVEL');bev.width=.012;bev.segments=3
top_profile=[(-2.56,.94),(-2.35,1.02),(-1.9,1.07),(-1.25,1.11),(-.6,1.13),(.6,1.13),(1.4,1.12),(2.1,1.09),(2.43,1.03)]
def top_at(x,z):
    for (xa,ya),(xb,yb) in zip(top_profile,top_profile[1:]):
        if xa<=x<=xb:
            y=ya+(yb-ya)*(x-xa)/(xb-xa);edge=abs(z);upper=max(0,min(1,(y-.82)/.28));return y+upper*(.07*(1-edge**3)-.035*edge**10)
    return 1.1
def bonnet(u,v):
    x=-2.43+u*1.50;z=(v*2-1)*(.86+.025*u);return(x,top_at(x,z)+.004,z)
surface('hood_surface',bonnet,paint)
def windscreen(u,v):
    z=(u*2-1)*(.91-v*.16);bottom=top_at(-1.02,(u*2-1)*.91)+.006;top=1.54+.02*(1-(u*2-1)**2)
    return(-1.02+v*.69,bottom*(1-v)+top*v+.02*math.sin(v*math.pi),z)
surface('front_glass',windscreen,glass)
surface('roof_surface',lambda u,v:(-.33+u*1.02,1.54+.02*(1-(v*2-1)**2)+.018*math.sin(u*math.pi),(v*2-1)*.75),paint)
def rear_window(u,v):
    z=(u*2-1)*(.75+v*.17);top=1.54+.02*(1-(u*2-1)**2);bottom=top_at(1.67,(u*2-1)*.92)+.006
    return(.69+v*.98,top*(1-v)+bottom*v+.018*math.sin(v*math.pi),z)
surface('rear_glass',rear_window,glass)
for sign,label in [(-1,'left'),(1,'right')]:
    def window(u,v,sg=sign):
        lower=-.89+u*2.36;upper=-.29+u*.93
        bottom=top_at(lower,.962)+.006
        return(lower*(1-v)+upper*v,bottom*(1-v)+1.515*v,sg*(.962-v*.208+.018*math.sin(u*math.pi)*math.sin(v*math.pi)))
    surface(label+'_glass',window,glass,32,12)
    for a,b in [((-.99,top_at(-.99,.94),sign*.94),(-.33,1.54,sign*.75)),((.69,1.54,sign*.75),(1.63,top_at(1.63,.94),sign*.94)),((.37,top_at(.37,.963),sign*.963),(.34,1.535,sign*.756))]:
        curve=bpy.data.curves.new('Window pillar','CURVE');curve.dimensions='3D';curve.bevel_depth=.028;curve.bevel_resolution=3;s=curve.splines.new('POLY');s.points.add(1);s.points[0].co=(*xyz(a),1);s.points[1].co=(*xyz(b),1);o=bpy.data.objects.new('pillar_'+label+str(a[0]),curve);bpy.context.collection.objects.link(o);o.data.materials.append(paint);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
# Export only the new body panels; existing Three.js upgrades remain fully modular.
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'coachwork-v2.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True)
bpy.ops.object.select_all(action='DESELECT')
# An honest standalone render of the new silhouette, for visual QA of the modeled panels.
for x in[-1.57,1.57]:
    for sign in[-1,1]:
        bpy.ops.mesh.primitive_torus_add(major_radius=.347,minor_radius=.137,major_segments=64,minor_segments=16,location=xyz((x,.49,sign*1.015)),rotation=(math.pi/2,0,0));o=bpy.context.object;o.name='Preview tire';o.data.materials.append(rubber)
        for poly in o.data.polygons:poly.use_smooth=True
        bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.32,depth=.045,location=xyz((x,.49,sign*1.17)),rotation=(math.pi/2,0,0));bpy.context.object.data.materials.append(silver)
        for i in range(7):
            angle=i/7*math.tau;bpy.ops.mesh.primitive_cube_add(size=1,location=xyz((x+math.sin(angle)*.16,.49+math.cos(angle)*.16,sign*1.20)));o=bpy.context.object;o.dimensions=(.05,.04,.30);o.rotation_euler[1]=angle;o.data.materials.append(silver)
for x,y,z,dx,dy,dz,material in[(-2.60,.47,0,.21,.22,1.95,paint),(2.60,.48,0,.20,.24,1.95,paint),(-2.69,.66,0,.025,.22,1.15,black)]:
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz((x,y,z)));o=bpy.context.object;o.dimensions=(dx,dz,dy);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material);m=o.modifiers.new('Rounded preview bumper','BEVEL');m.width=.06;m.segments=4
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.015));bpy.context.object.data.materials.append(mat('Studio floor',(.04,.055,.045),.1,.65))
bpy.ops.object.camera_add(location=xyz((-7,3.5,7)));camera=bpy.context.object;camera.rotation_euler=(Vector(xyz((0,.75,0)))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=48;bpy.context.scene.camera=camera
for p,power,size,color in[((-3,6,4),1500,5,(.88,1,.82)),((3,4,-3),1700,4,(.6,.8,1)),((4,3,5),1100,3,(1,.6,.28))]:
    bpy.ops.object.light_add(type='AREA',location=xyz(p));o=bpy.context.object;o.data.energy=power;o.data.size=size;o.data.color=color;o.rotation_euler=(Vector(xyz((0,.8,0)))-o.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.render.resolution_x=1200;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(OUT,'coupe-v2-shape-preview.png');scene.world.color=(.16,.18,.16)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'coupe-v2.blend'));bpy.ops.render.render(write_still=True)
print('COUPE V2 READY')
