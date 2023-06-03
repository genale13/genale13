import pandas as pd
import streamlit as st
from datetime import datetime
from sklearn.datasets import fetch_openml

# dataset = openml.dataset.get_dataset('iris')
# df = dataset.get_dataframe()
# st.dataframe (df)

dataset = fetch_openml('iris')
df = pd.DataFrame(data=dataset.data, columns=dataset.feature_names)
df['target'] = dataset.target

with st.sidebar:
    st.image('./logo.png')
    st.title("AutoML")
    choice = st.radio("Navigation",["Data Preprocessing","Data Profiling","Cash","Download"])
    st.info("You can navigate through each of the sections")
st.write("This is an automated machin learning project")

if choice =="Data Preprocessing":
    st.write("This section is under development please make sure that the data is preprocessed accordingly")
    st.info("Only preprocessed data can make good results")

    options =("Upload your data","Default Test data")
    input = st.selectbox("Select your Data loading methods",options)

    if input == "Upload your data":
        uploaded_file=st.file_uploader("Upload Data")

        if uploaded_file is not None:
            df =pd.read_csv(uploaded_file)
            st.dataframe(df)

    if input == "Default Test data":
        from sklearn.datasets import fetch_openml
        # dataset = openml.dataset.get_dataset('iris')
        # df = dataset.get_dataframe()
        # st.dataframe (df)

        dataset = fetch_openml('iris')
        df =pd.DataFrame(data=dataset.data, columns=dataset.feature_names)
        df['target']= dataset.target
        st.dataframe(df)
        pass

if choice =="Data Preprocessing":
    pass

if choice =="Data Profiling":
    import pandas_profiling
    from streamlit_pandas_profiling import st_profile_report
    st.title("Explore today data analyisis")
    profile_report = df.profile_report()
    st_profile_report(profile_report)
    pass

if choice =="Cash":
    st.checkbox("Yes")
    st.checkbox("No")
    st.button("Submit")
    st.multiselect("Favorite food", ["burger","pizza","icecream"])
    st.select_slider("rate the movie",["Good","Average","Bad"])
    st.slider("choose number",0,50)

    st.number_input("enter your age:",0,120)
    st.text_input("enter name")
    min_date = datetime(1920,1,1)
    max_date = datetime(2030, 1, 1)
    st.date_input("enter your DOB",min_value=min_date, max_value=max_date)
    st.time_input("when should we stop the class")
    st.text_area("how do we feel today")
    st.color_picker("choose your favorite color")
    pass

if choice =="Download":
    st.text_input("Enter your Name")
    food = st.selectbox("Select your food", ["burger", "pizza", "icecream"])
    if food == "burger":
        st.video("https://www.youtube.com/watch?v=L6yX6Oxy_J8")
        st.text("you choose burger")

    if food == "pizza":
        st.video("https://www.youtube.com/watch?v=1-SJGQ2HLp8&ab_channel=JamieOliver")
        st.text("you choose pizza")


    if food == "icecream":
        st.video("https://www.youtube.com/watch?v=TUt3guu92Zg&ab_channel=BLACKPINK-Topic")
        st.text("you choose icecream")


    st.text("Tanks for choosing food bla bla bla")
    pass