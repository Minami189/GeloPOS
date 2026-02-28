import { StyleSheet, Text, View } from 'react-native';

export default function Navbar(){
    return(
        <View style={styles.container}>
            <Text style={styles.text}>poopoo asdasd</Text>
        </View>
    )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    height: '100%',
    width: '10px',
    alignItems: 'top',
    justifyContent: 'center',
    elevation: 5,
    padding: 25,
    borderRightWidth: 1,
    borderColor: "#bebebe"
  },
  text: {
    color: '#fff'
  }
});